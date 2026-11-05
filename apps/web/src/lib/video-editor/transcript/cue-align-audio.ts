/**
 * The audio caption alignment reads: one channel at a low rate, decoded in
 * bounded chunks so a long clip never holds its full-rate audio in memory.
 * The speech envelope works on 10 ms frames, so 8 kHz keeps every edge it
 * can see.
 */
import type { AudioBufferLike } from '../audio/audio-silence';
import { decodeAudioRangeForAnalysis } from '../media/silence';
import { monoSamples } from './cue-align';

/** The rate alignment runs at. */
export const ALIGN_SAMPLE_RATE = 8_000;
/** Longer source windows keep their transcript timing rather than decode this much audio. */
export const ALIGN_MAX_SECONDS = 30 * 60;
const CHUNK_SECONDS = 30;

export interface AlignAudio {
	samples: Float32Array;
	sampleRate: number;
}

/** Average `samples` down by a whole factor, so energy per frame is kept. */
export function decimate(samples: Float32Array, factor: number): Float32Array {
	if (factor <= 1) return samples;
	const out = new Float32Array(Math.floor(samples.length / factor));
	for (let i = 0; i < out.length; i++) {
		let sum = 0;
		const from = i * factor;
		for (let j = 0; j < factor; j++) sum += samples[from + j]!;
		out[i] = sum / factor;
	}
	return out;
}

export type DecodeRange = (
	mediaId: string,
	startSeconds: number,
	endSeconds: number,
	signal?: AbortSignal
) => Promise<AudioBufferLike>;

/**
 * One channel of a source window at about 8 kHz, starting at `startSeconds`.
 * Null when the window is too long to be worth decoding or has no audio.
 */
export async function decodeAlignAudio(
	mediaId: string,
	startSeconds: number,
	endSeconds: number,
	options: { signal?: AbortSignal; decode?: DecodeRange } = {}
): Promise<AlignAudio | null> {
	const span = endSeconds - startSeconds;
	if (!(span > 0) || span > ALIGN_MAX_SECONDS) return null;
	const decode = options.decode ?? decodeAudioRangeForAnalysis;
	const parts: Float32Array[] = [];
	let rate = 0;
	for (let from = startSeconds; from < endSeconds; from += CHUNK_SECONDS) {
		const to = Math.min(endSeconds, from + CHUNK_SECONDS);
		const buffer = await decode(mediaId, from, to, options.signal);
		if (buffer.length === 0) continue;
		const factor = Math.max(1, Math.round(buffer.sampleRate / ALIGN_SAMPLE_RATE));
		const chunkRate = buffer.sampleRate / factor;
		if (rate && Math.abs(chunkRate - rate) > 1) return null;
		rate = chunkRate;
		parts.push(decimate(monoSamples(buffer), factor));
	}
	if (!rate || parts.length === 0) return null;
	const samples = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		samples.set(part, offset);
		offset += part.length;
	}
	return { samples, sampleRate: rate };
}
