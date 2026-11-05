import { describe, expect, it } from 'vitest';
import {
	HDR_REFERENCE_WHITE_NITS,
	HDR_ROLLOFF_KNEE,
	applyCorrection,
	hdrRolloff,
	hdrSignalNits,
	hdrSignalToSdr,
	taggedHdrCorrection
} from './tagged-hdr';
import { hlgOetf, hlgOetfInverse, pqEncode, srgbEncode } from './color-space';
import { gpuRenderEffects, hasOwnSourceProfile } from './gpu/render-effects';
import { SOURCE_PROFILE_EFFECT_ID } from './source-profile';
import { hdrMediaTags, hdrTransferOf, isHdrMediaTag, mediaHdrTransfer } from '../media/hdr-tags';
import type { ItemEffect } from './types';

/** Chrome's measured HLG curve on an SDR display, every 65th 10-bit level. */
const CHROME_HLG = [0, 3, 14, 29, 44, 58, 72, 86, 100, 117, 138, 161, 193, 214, 230, 245, 254];
const CHROME_PQ = [0, 1, 5, 15, 31, 49, 72, 100, 135, 178, 217, 238, 255, 255, 255, 255, 255];

function curve(samples: number[]): Float32Array {
	return Float32Array.from(samples, (value) => value / 255);
}

describe('tagged HDR rendering', () => {
	it('puts reference white at SDR white and rolls brighter light off without clipping', () => {
		const hlgWhite = 0.75;
		expect(hdrSignalNits('hlg', hlgWhite)).toBeCloseTo(HDR_REFERENCE_WHITE_NITS, -1);
		expect(hdrSignalNits('pq', pqEncode(203))).toBeCloseTo(203, 3);
		expect(hdrSignalToSdr('hlg', hlgWhite)).toBeGreaterThan(0.95);
		expect(hdrSignalToSdr('hlg', 1)).toBeLessThanOrEqual(1);
		expect(hdrSignalToSdr('hlg', 1)).toBeGreaterThan(hdrSignalToSdr('hlg', 0.9));
		expect(hdrRolloff(0.5)).toBe(0.5);
		expect(hdrRolloff(HDR_ROLLOFF_KNEE)).toBe(HDR_ROLLOFF_KNEE);
		expect(hdrRolloff(100)).toBeCloseTo(1, 6);
		// Slope stays 1 through the knee, so there is no visible bend.
		const d = 1e-4;
		expect((hdrRolloff(HDR_ROLLOFF_KNEE + d) - HDR_ROLLOFF_KNEE) / d).toBeCloseTo(1, 3);
	});

	it('undoes a browser that passes the signal straight through', () => {
		const identity = Float32Array.from({ length: 1024 }, (_, i) => i / 1023);
		const table = taggedHdrCorrection(identity, 'hlg');
		for (const signal of [0.1, 0.5, 0.75, 0.9]) {
			expect(applyCorrection(table, signal)).toBeCloseTo(hdrSignalToSdr('hlg', signal), 2);
		}
	});

	it('undoes a browser that maps HLG through its own curve', () => {
		// A browser that decodes HLG to plain scene light and sRGB-encodes it.
		const browser = (s: number) => srgbEncode(hlgOetfInverse(s));
		const measured = Float32Array.from({ length: 1024 }, (_, i) => browser(i / 1023));
		const table = taggedHdrCorrection(measured, 'hlg');
		for (const signal of [0.2, 0.4, 0.6]) {
			expect(applyCorrection(table, browser(signal))).toBeCloseTo(hdrSignalToSdr('hlg', signal), 2);
		}
		expect(hlgOetf(hlgOetfInverse(0.6))).toBeCloseTo(0.6, 6);
	});

	it('brightens Chrome HLG reference white and keeps PQ monotonic past its clip', () => {
		const hlg = taggedHdrCorrection(curve(CHROME_HLG), 'hlg');
		// Chrome draws HLG reference white (75%) near 187; it should be close to white.
		expect(applyCorrection(hlg, 187 / 255)).toBeGreaterThan(0.93);
		const pq = taggedHdrCorrection(curve(CHROME_PQ), 'pq');
		let previous = -1;
		for (let i = 0; i < pq.length; i++) {
			expect(pq[i]!).toBeGreaterThanOrEqual(previous);
			previous = pq[i]!;
		}
		expect(pq[255]).toBeLessThanOrEqual(1);
		expect(pq[0]).toBe(0);
	});
});

describe('HDR media and clip effects', () => {
	it('tags media by the transfer their colour tags declare', () => {
		expect(hdrTransferOf('hlg')).toBe('hlg');
		expect(hdrTransferOf('pq')).toBe('pq');
		expect(hdrTransferOf('bt709')).toBeUndefined();
		expect(hdrTransferOf(null)).toBeUndefined();
		expect(hdrMediaTags('pq')).toEqual(['hdr-pq']);
		expect(hdrMediaTags(undefined)).toEqual([]);
		expect(isHdrMediaTag('hdr-hlg')).toBe(true);
		expect(mediaHdrTransfer({ tags: ['video', 'hdr-hlg'] })).toBe('hlg');
		expect(mediaHdrTransfer({ tags: ['video'] })).toBeNull();
		expect(mediaHdrTransfer(undefined)).toBeNull();
	});

	it('adds the tagged profile first unless the clip has its own source profile', () => {
		const grade: ItemEffect = {
			id: 'g',
			type: 'gpu',
			effectId: 'gpu-color-wheels',
			params: {},
			enabled: true
		};
		const auto = gpuRenderEffects([grade], 'hlg');
		expect(auto[0]).toEqual({
			effectId: SOURCE_PROFILE_EFFECT_ID,
			params: { profile: 'hlg-tagged' }
		});
		expect(auto[1]?.effectId).toBe('gpu-color-wheels');
		expect(gpuRenderEffects([grade], 'pq')[0]?.params).toEqual({ profile: 'pq-tagged' });
		expect(gpuRenderEffects([grade], null)).toHaveLength(1);

		const own: ItemEffect = {
			id: 's',
			type: 'gpu',
			effectId: SOURCE_PROFILE_EFFECT_ID,
			params: { profile: 'rec709' },
			enabled: true
		};
		expect(hasOwnSourceProfile([own])).toBe(true);
		expect(gpuRenderEffects([own, grade], 'hlg').map((e) => e.params.profile)).toEqual([
			'rec709',
			undefined
		]);
		// Turning the clip's own profile off turns the conversion off too.
		expect(gpuRenderEffects([{ ...own, enabled: false }, grade], 'hlg')).toHaveLength(1);
	});
});
