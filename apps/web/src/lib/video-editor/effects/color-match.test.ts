import { describe, expect, it } from 'vitest';
import {
	colorStatsFromPixels,
	displayToLab,
	matchColorWheels,
	renderColorWheels,
	samplePixels
} from './color-match';

/** A frame with a full tonal range and some colour: a lit scene, not a flat card. */
function scene(size = 64): Uint8ClampedArray {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			const light = (x + y) / (2 * (size - 1));
			data[i] = 30 + 190 * light + 20 * Math.sin(y / 5);
			data[i + 1] = 25 + 200 * light;
			data[i + 2] = 40 + 160 * light + 25 * Math.cos(x / 7);
			data[i + 3] = 255;
		}
	}
	return data;
}

function graded(source: Uint8ClampedArray, settings: Record<string, number>): Uint8ClampedArray {
	const out = source.slice();
	renderColorWheels(out, settings);
	return out;
}

describe('color match', () => {
	it('reads neutral display white and black as L* 100 and 0', () => {
		expect(displayToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
		expect(displayToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
		const [, a, b] = displayToLab(128, 128, 128);
		expect(Math.abs(a)).toBeLessThan(0.5);
		expect(Math.abs(b)).toBeLessThan(0.5);
	});

	it('leaves pixels alone at the default wheel settings', () => {
		const source = scene();
		expect(graded(source, {})).toEqual(source);
	});

	it('warms with temperature and brightens with exposure, as the shader does', () => {
		const pixel = new Uint8ClampedArray([100, 100, 100, 255]);
		const warm = graded(pixel, { temperature: 50 });
		expect(warm[0]).toBeGreaterThan(100);
		expect(warm[2]).toBeLessThan(100);
		const brighter = graded(pixel, { exposure: 1 });
		// 100/255 × 2, about grey pivot 0.5 at contrast 1.
		expect(brighter[0]).toBe(200);
	});

	it('skips transparent pixels and evenly samples large frames', () => {
		expect(colorStatsFromPixels(new Uint8ClampedArray([10, 10, 10, 0]))).toBeUndefined();
		const big = scene(200);
		expect(samplePixels(big, 1000).length).toBe(4000);
	});

	it('changes nothing when the clip already looks like the reference', async () => {
		const source = scene();
		const reference = colorStatsFromPixels(source)!;
		expect(await matchColorWheels({ source, reference, current: {} })).toEqual({});
	});

	it('finds the warmth, exposure and saturation a reference was graded with', async () => {
		const source = scene();
		const look = { exposure: 0.4, temperature: 18, saturation: -25 };
		const reference = colorStatsFromPixels(graded(source, look))!;

		const match = await matchColorWheels({ source, reference, current: {} });

		expect(match.temperature).toBeGreaterThan(8);
		expect(match.exposure).toBeGreaterThan(0.15);
		expect(match.saturation).toBeLessThan(-8);
		const matched = colorStatsFromPixels(graded(source, match))!;
		const before = colorStatsFromPixels(source)!;
		const gap = (stats: typeof before) =>
			stats.lightness.reduce((sum, value, i) => sum + Math.abs(value - reference.lightness[i]!), 0);
		expect(gap(matched)).toBeLessThan(gap(before) / 4);
	});

	it('starts from the current grade, keeps other wheels and scales by strength', async () => {
		const source = scene();
		const reference = colorStatsFromPixels(graded(source, { gain: 1.1, temperature: 30 }))!;
		const full = await matchColorWheels({ source, reference, current: { gain: 1.1 } });
		const half = await matchColorWheels({
			source,
			reference,
			current: { gain: 1.1 },
			strength: 0.5
		});

		expect(full.gain).toBeUndefined();
		expect(full.temperature).toBeGreaterThan(15);
		expect(Math.abs(half.temperature! - full.temperature! / 2)).toBeLessThanOrEqual(1);
	});
});
