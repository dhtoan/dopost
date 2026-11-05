import { describe, expect, it } from 'vitest';
import { measureLoudness } from './loudness';
import { masteredMixWindows, type MixWindow } from './mastered-mix';

const RATE = 48_000;

function sineWindows(
	dbfs: number,
	seconds: number,
	windowSeconds = 1
): () => AsyncIterable<MixWindow> {
	const amplitude = 10 ** (dbfs / 20);
	const total = Math.round(seconds * RATE);
	const size = Math.round(windowSeconds * RATE);
	return async function* () {
		for (let start = 0; start < total; start += size) {
			const length = Math.min(size, total - start);
			const left = new Float32Array(length);
			for (let i = 0; i < length; i++)
				left[i] = amplitude * Math.sin((2 * Math.PI * 997 * (start + i)) / RATE);
			yield { samples: [left, left.slice()] };
		}
	};
}

async function collect(stream: AsyncIterable<MixWindow>): Promise<Float32Array[]> {
	const parts: Float32Array[][] = [];
	for await (const win of stream) parts.push(win.samples);
	return [0, 1].map((channel) => {
		const length = parts.reduce((sum, part) => sum + part[channel]!.length, 0);
		const out = new Float32Array(length);
		let offset = 0;
		for (const part of parts) {
			out.set(part[channel]!, offset);
			offset += part[channel]!.length;
		}
		return out;
	});
}

describe('masteredMixWindows', () => {
	it('passes the mix through untouched when loudness is off', async () => {
		const source = await collect(sineWindows(-20, 2)());
		const passed = await collect(masteredMixWindows(sineWindows(-20, 2), 'off', RATE, 2));
		expect(passed[0]).toEqual(source[0]);
	});

	it('masters a quiet mix to the social target and keeps its length', async () => {
		const mastered = await collect(masteredMixWindows(sineWindows(-40, 6), 'social', RATE, 2));
		expect(mastered[0]!.length).toBe(6 * RATE);
		const measured = measureLoudness(mastered, RATE);
		expect(measured.integratedLufs).toBeGreaterThan(-15);
		expect(measured.integratedLufs).toBeLessThan(-13);
		expect(measured.truePeakDbtp).toBeLessThanOrEqual(-0.9);
	});

	it('turns a hot mix down to the broadcast target', async () => {
		const mastered = await collect(masteredMixWindows(sineWindows(-3, 6), 'broadcast', RATE, 2));
		const measured = measureLoudness(mastered, RATE);
		expect(measured.integratedLufs).toBeGreaterThan(-24);
		expect(measured.integratedLufs).toBeLessThan(-22);
	});
});
