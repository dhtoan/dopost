// Adapted from Donkey Cut (site/packages/effects-kit/src/colorPipeline.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: only the source stage for an SDR
// project, baked into an 8-bit lattice for the gpu-source-profile effect. See NOTICE.md.

/**
 * What a clip's code values mean, and the conversion that turns them into
 * the Rec.709 picture the rest of the grade works on:
 *
 * - Rec.709 needs none.
 * - Apple Log and Apple Log 2 decode to scene-linear ACES (AP0) and go through
 *   the ACES 2.0 Rec.709 100-nit output transform.
 * - HLG and PQ are display-referred, so they reach SDR through the BT.2100
 *   OOTF on a 100-nit display; PQ crosses into HLG at 1000 nits first.
 *
 * The browser draws a file through whatever its tags say. A tagged HLG or PQ
 * file is already mapped to SDR by the decoder, so HLG and PQ are for footage
 * that arrives flat: log, or HDR whose tags were lost on the way. The
 * "tagged file" profiles instead correct the browser's own mapping of a
 * tagged file (see tagged-hdr.ts); HDR media gets them automatically.
 */

import { acesOutputTransform } from './aces-output';
import { applyCorrection, browserTaggedHdrCorrection } from './tagged-hdr';
import {
	AP0_PRIMARIES,
	APPLE_WIDE_GAMUT_PRIMARIES,
	BRADFORD,
	REC2020_PRIMARIES,
	REC709_PRIMARIES,
	type Mat3,
	appleLogDecode,
	hlgOetf,
	hlgOetfInverse,
	hlgOotf,
	hlgOotfInverse,
	mat3Apply,
	pqDecode,
	rgbToRgbMatrix,
	srgbEncode
} from './color-space';

export const SOURCE_PROFILE_EFFECT_ID = 'gpu-source-profile';

export type SourceProfile =
	| 'rec709'
	| 'apple-log'
	| 'apple-log-2'
	| 'hlg'
	| 'pq'
	| 'hlg-tagged'
	| 'pq-tagged';

/** Labels are the standards' own names, so they stay the same in every locale. */
export const SOURCE_PROFILES: readonly { value: SourceProfile; label: string }[] = [
	{ value: 'rec709', label: 'Rec.709' },
	{ value: 'apple-log', label: 'Apple Log' },
	{ value: 'apple-log-2', label: 'Apple Log 2' },
	{ value: 'hlg', label: 'HLG' },
	{ value: 'pq', label: 'PQ' },
	{ value: 'hlg-tagged', label: 'HLG (tagged file)' },
	{ value: 'pq-tagged', label: 'PQ (tagged file)' }
];

export function isSourceProfile(value: unknown): value is SourceProfile {
	return SOURCE_PROFILES.some((profile) => profile.value === value);
}

type Transform = (r: number, g: number, b: number) => [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const REC2020_TO_AP0 = rgbToRgbMatrix(REC2020_PRIMARIES, AP0_PRIMARIES, BRADFORD);
const AWG_TO_AP0 = rgbToRgbMatrix(APPLE_WIDE_GAMUT_PRIMARIES, AP0_PRIMARIES, BRADFORD);
const REC2020_TO_REC709 = rgbToRgbMatrix(REC2020_PRIMARIES, REC709_PRIMARIES);
const SDR_PEAK_NITS = 100;

/** PQ signal -> HLG signal: display light back through the BT.2390 inverse
 * OOTF at 1000 nits and the HLG OETF. */
export function pqToHlg(r: number, g: number, b: number): [number, number, number] {
	const [rs, gs, bs] = hlgOotfInverse(pqDecode(r), pqDecode(g), pqDecode(b), 1000);
	return [hlgOetf(rs), hlgOetf(gs), hlgOetf(bs)];
}

/** HLG signal -> SDR signal: the HLG picture on a 100-nit display, the BT.2100
 * OOTF at that peak's system gamma with HLG's peak at SDR white, moved into
 * Rec.709 primaries, clipped and sRGB-encoded. */
export function hlgToSdr(r: number, g: number, b: number): [number, number, number] {
	const k = 1 / SDR_PEAK_NITS;
	const [rd, gd, bd] = hlgOotf(
		hlgOetfInverse(r),
		hlgOetfInverse(g),
		hlgOetfInverse(b),
		SDR_PEAK_NITS
	);
	const [x, y, z] = mat3Apply(REC2020_TO_REC709, rd * k, gd * k, bd * k);
	return [srgbEncode(clamp01(x)), srgbEncode(clamp01(y)), srgbEncode(clamp01(z))];
}

function logToSdr(toAp0: Mat3): Transform {
	const ot = acesOutputTransform('rec709-100');
	return (r, g, b) => {
		const [ar, ag, ab] = mat3Apply(
			toAp0,
			appleLogDecode(clamp01(r)),
			appleLogDecode(clamp01(g)),
			appleLogDecode(clamp01(b))
		);
		return ot.forward(ar, ag, ab);
	};
}

/** The conversion from a profile's code values to Rec.709 display values, or
 * null when the source already is Rec.709. */
export function sourceToSdr(profile: SourceProfile): Transform | null {
	switch (profile) {
		case 'apple-log':
			return logToSdr(REC2020_TO_AP0);
		case 'apple-log-2':
			return logToSdr(AWG_TO_AP0);
		case 'hlg':
			return (r, g, b) => hlgToSdr(clamp01(r), clamp01(g), clamp01(b));
		case 'pq':
			return (r, g, b) => hlgToSdr(...pqToHlg(clamp01(r), clamp01(g), clamp01(b)));
		case 'hlg-tagged':
		case 'pq-tagged': {
			const table = browserTaggedHdrCorrection(profile === 'hlg-tagged' ? 'hlg' : 'pq');
			if (!table) return null;
			return (r, g, b) => [
				applyCorrection(table, r),
				applyCorrection(table, g),
				applyCorrection(table, b)
			];
		}
		default:
			return null;
	}
}

/** Nodes per axis: the size Donkey Cut bakes its grade lattices at. */
export const SOURCE_PROFILE_LUT_SIZE = 33;

const lattices = new Map<string, Uint8Array>();

/**
 * The conversion sampled onto an rgba8 lattice, red fastest (the .cube order
 * the gpu-lut texture uses). Null for Rec.709. Built once per profile and
 * size; the ACES transform makes the first build take a moment.
 */
export function buildSourceProfileLut(
	profile: SourceProfile,
	size = SOURCE_PROFILE_LUT_SIZE
): Uint8Array | null {
	const key = `${profile}|${size}`;
	const hit = lattices.get(key);
	if (hit) return hit;
	const fn = sourceToSdr(profile);
	if (!fn) return null;
	const data = new Uint8Array(size * size * size * 4);
	const step = 1 / (size - 1);
	let i = 0;
	for (let b = 0; b < size; b++) {
		for (let g = 0; g < size; g++) {
			for (let r = 0; r < size; r++) {
				const out = fn(r * step, g * step, b * step);
				data[i++] = Math.round(clamp01(out[0]) * 255);
				data[i++] = Math.round(clamp01(out[1]) * 255);
				data[i++] = Math.round(clamp01(out[2]) * 255);
				data[i++] = 255;
			}
		}
	}
	lattices.set(key, data);
	return data;
}
