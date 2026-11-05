import { describe, expect, test } from 'vitest';
import type { AudioBufferLike } from '../audio/audio-silence';
import { ALIGN_MAX_SECONDS, decimate, decodeAlignAudio } from './cue-align-audio';

function buffer(seconds: number, sampleRate: number, value: number): AudioBufferLike {
	const data = new Float32Array(Math.round(seconds * sampleRate)).fill(value);
	return {
		duration: seconds,
		length: data.length,
		numberOfChannels: 2,
		sampleRate,
		getChannelData: () => data
	};
}

describe('caption alignment audio', () => {
	test('averages samples down by a whole factor', () => {
		expect([...decimate(new Float32Array([1, 3, 5, 7, 9]), 2)]).toEqual([2, 6]);
		const same = new Float32Array([1, 2]);
		expect(decimate(same, 1)).toBe(same);
	});

	test('decodes a window in chunks at about 8 kHz, in order', async () => {
		const calls: [number, number][] = [];
		const audio = await decodeAlignAudio('m', 10, 75, {
			decode: async (_id, from, to) => {
				calls.push([from, to]);
				return buffer(to - from, 48_000, from);
			}
		});
		expect(calls).toEqual([
			[10, 40],
			[40, 70],
			[70, 75]
		]);
		expect(audio?.sampleRate).toBe(8_000);
		expect(audio?.samples.length).toBe(65 * 8_000);
		// Chunks land in order: the first sample is from the first chunk, the last from the last.
		expect(audio?.samples[0]).toBe(10);
		expect(audio?.samples.at(-1)).toBe(70);
	});

	test('skips windows too long or empty to align', async () => {
		let decoded = 0;
		const decode = async () => {
			decoded++;
			return buffer(1, 48_000, 0);
		};
		expect(await decodeAlignAudio('m', 0, ALIGN_MAX_SECONDS + 1, { decode })).toBeNull();
		expect(await decodeAlignAudio('m', 5, 5, { decode })).toBeNull();
		expect(decoded).toBe(0);
	});
});
