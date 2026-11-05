// Adapted from Donkey Cut (site/packages/effects-kit/src/colorSpace.test.ts and
// colorPipeline.test.ts, commit cddf34f), Copyright 2026 Donkey, Apache-2.0.
// Modified for dopost: vitest, the SDR source stage and its 8-bit lattice. See NOTICE.md.
import { describe, expect, it } from 'vitest';
import {
	REC2020_PRIMARIES,
	REC709_PRIMARIES,
	appleLogDecode,
	appleLogEncode,
	hlgOetf,
	hlgOetfInverse,
	hlgOotf,
	hlgOotfInverse,
	mat3Apply,
	pqDecode,
	pqEncode,
	rgbToRgbMatrix,
	rgbToXyzMatrix
} from './color-space';
import {
	SOURCE_PROFILE_EFFECT_ID,
	SOURCE_PROFILE_LUT_SIZE,
	buildSourceProfileLut,
	sourceToSdr
} from './source-profile';
import { isColorGradeEffect } from './color-grade';
import { sourceProfile } from './gpu/source-profile';

const near = (a: readonly number[], b: readonly number[], eps: number) => {
	expect(a.length).toBe(b.length);
	for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(eps);
};
const neutral = (v: readonly number[]) => {
	expect(Math.abs(v[0]! - v[1]!)).toBeLessThan(1e-3);
	expect(Math.abs(v[1]! - v[2]!)).toBeLessThan(1e-3);
};

/** Rec.709 display-linear -> HLG signal with white at 75% (BT.2408), as a phone records SDR content. */
function sdrToHlg(r: number, g: number, b: number): [number, number, number] {
	const toRec2020 = rgbToRgbMatrix(REC709_PRIMARIES, REC2020_PRIMARIES);
	const [rd, gd, bd] = mat3Apply(toRec2020, r * 203, g * 203, b * 203);
	const [rs, gs, bs] = hlgOotfInverse(rd, gd, bd, 1000);
	return [hlgOetf(rs), hlgOetf(gs), hlgOetf(bs)];
}

describe('color space', () => {
	it('derives the published luma weights from the primaries', () => {
		const m = rgbToXyzMatrix(REC709_PRIMARIES);
		near([m[3]!, m[4]!, m[5]!], [0.2126, 0.7152, 0.0722], 1e-4);
		const m2020 = rgbToXyzMatrix(REC2020_PRIMARIES);
		near([m2020[3]!, m2020[4]!, m2020[5]!], [0.2627, 0.678, 0.0593], 1e-4);
	});

	it('puts Apple Log 18% grey near 48.8% and inverts it', () => {
		expect(Math.abs(appleLogEncode(0.18) - 0.4883)).toBeLessThan(1e-3);
		for (const r of [-0.05, 0, 0.005, 0.01, 0.18, 1, 4, 16]) {
			expect(Math.abs(appleLogDecode(appleLogEncode(r)) - r)).toBeLessThan(
				1e-9 + Math.abs(r) * 1e-9
			);
		}
	});

	it('pins the HLG and PQ curves and inverts them', () => {
		expect(hlgOetf(1 / 12)).toBeCloseTo(0.5, 9);
		for (const s of [0.1, 0.5, 0.75, 0.9])
			expect(Math.abs(hlgOetf(hlgOetfInverse(s)) - s)).toBeLessThan(1e-9);
		expect(hlgOotf(1, 1, 1, 1000)[0]).toBeCloseTo(1000, 6);
		expect(pqEncode(10000)).toBeCloseTo(1, 9);
		expect(Math.abs(pqEncode(100) - 0.5081)).toBeLessThan(1e-3);
		for (const n of [0.5, 10, 203, 1000])
			expect(Math.abs(pqDecode(pqEncode(n)) - n)).toBeLessThan(1e-6 * n);
	});
});

describe('source profiles', () => {
	it('leaves Rec.709 alone', () => {
		expect(sourceToSdr('rec709')).toBeNull();
		expect(buildSourceProfileLut('rec709')).toBeNull();
	});

	it('renders Apple Log 18% grey as ACES middle grey in both gamuts', () => {
		const v = appleLogEncode(0.18);
		const out = sourceToSdr('apple-log')!(v, v, v);
		neutral(out);
		expect(Math.abs(out[0] - 0.3831)).toBeLessThan(2e-3);
		const out2 = sourceToSdr('apple-log-2')!(v, v, v);
		neutral(out2);
		expect(Math.abs(out2[0] - out[0])).toBeLessThan(1e-3);
	});

	it('agrees on reference white for HLG and PQ', () => {
		const hlg = sourceToSdr('hlg')!(0.75, 0.75, 0.75);
		const p = pqEncode(203);
		const pq = sourceToSdr('pq')!(p, p, p);
		neutral(hlg);
		neutral(pq);
		expect(Math.abs(hlg[0] - pq[0])).toBeLessThan(2e-3);
		expect(Math.abs(hlg[0] - 0.6056)).toBeLessThan(2e-3);
	});

	it('keeps an HLG red red', () => {
		const out = sourceToSdr('hlg')!(...sdrToHlg(0.6, 0, 0));
		expect(out[0]).toBeGreaterThan(0.5);
		expect(out[1]).toBeLessThan(0.01);
		expect(out[2]).toBeLessThan(0.01);
	});

	it('bakes an rgba8 lattice, red fastest, that matches the transform at its nodes', () => {
		const size = 5;
		const lut = buildSourceProfileLut('apple-log', size)!;
		expect(lut.length).toBe(size * size * size * 4);
		expect(buildSourceProfileLut('apple-log', size)).toBe(lut);
		const fn = sourceToSdr('apple-log')!;
		// Node (r=4, g=1, b=2): index ((b * size + g) * size + r).
		const at = ((2 * size + 1) * size + 4) * 4;
		const expected = fn(1, 0.25, 0.5).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
		near([lut[at]!, lut[at + 1]!, lut[at + 2]!], expected, 0);
		expect(lut[at + 3]).toBe(255);
	});
});

describe('source profile effect', () => {
	it('feeds the shader a full lattice, or the bypass marker for Rec.709', () => {
		const build = sourceProfile.dataTexture!.build;
		const log = build({ profile: 'apple-log' });
		expect(log.width).toBe(SOURCE_PROFILE_LUT_SIZE);
		expect(log.data.length).toBe(SOURCE_PROFILE_LUT_SIZE ** 3 * 4);
		expect(build({ profile: 'rec709' }).width).toBe(1);
		expect(build({ profile: 'unknown' }).width).toBe(1);
	});

	it('is not part of the grade', () => {
		expect(
			isColorGradeEffect({
				id: 'a',
				type: 'gpu',
				effectId: SOURCE_PROFILE_EFFECT_ID,
				params: { profile: 'apple-log' },
				enabled: true
			})
		).toBe(false);
		expect(
			isColorGradeEffect({
				id: 'b',
				type: 'gpu',
				effectId: 'gpu-color-wheels',
				params: {},
				enabled: true
			})
		).toBe(true);
	});
});
