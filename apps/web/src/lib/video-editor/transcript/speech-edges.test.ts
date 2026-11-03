// Adapted from Donkey Cut (site/src/cut/lib/cutRefine.test.ts and audioScan.test.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for vitest and dopost. See NOTICE.md.

import { describe, expect, test } from 'vitest';
import {
	AIR,
	MIN_AIR,
	placeEdge,
	REACH,
	refineRemovalRange,
	scanSpeech,
	settleJoint,
	speechFrom,
	type PcmChunk,
	type SpeechScan,
	type SpeechSegment
} from './speech-edges';

const RATE = 8000;

// ── Speech ──────────────────────────────────────────────────────────────────

/** Deterministic noise: a scan that passes four times in five is no test. */
const rng = (seed: number) => () => {
	seed = (seed * 1103515245 + 12345) % 2147483648;
	return seed / 2147483648 - 0.5;
};

interface Spoken {
	start: number;
	end: number;
	/** Peak amplitude, so a whispered aside can sit under a shouted line. */
	level?: number;
}

/**
 * A take: bursts shaped like words — attack, hold, decay, a wobble inside —
 * over a room. `floorDb` is the room, `bedDb` lays a steady tone under
 * everything, the case where nothing is ever truly quiet.
 */
async function* take(
	words: Spoken[],
	opts: { floorDb: number; bedDb?: number; duration: number; seed?: number }
): AsyncGenerator<PcmChunk> {
	const rate = 16000;
	const rnd = rng(opts.seed ?? 7);
	const out = new Float32Array(Math.ceil(opts.duration * rate));
	const floor = Math.pow(10, opts.floorDb / 20);
	for (let i = 0; i < out.length; i++) out[i] = rnd() * floor * 2;
	if (opts.bedDb !== undefined) {
		const bed = Math.pow(10, opts.bedDb / 20);
		for (let i = 0; i < out.length; i++) out[i] += Math.sin((2 * Math.PI * 110 * i) / rate) * bed;
	}
	for (const w of words) {
		const from = Math.round(w.start * rate);
		const to = Math.min(out.length, Math.round(w.end * rate));
		const len = Math.max(1, to - from);
		for (let i = from; i < to; i++) {
			const p = (i - from) / len;
			const env = Math.min(1, p / 0.1) * Math.min(1, (1 - p) / 0.15);
			const wobble = 0.7 + 0.3 * Math.sin(p * Math.PI * 4);
			out[i] += rnd() * (w.level ?? 0.6) * env * wobble;
		}
	}
	// Handed over in uneven spans, the way a decoder hands them over.
	for (let start = 0; start < out.length; start += 4321) {
		const end = Math.min(out.length, start + 4321);
		yield { channels: [out.slice(start, end)], timestamp: start / rate, sampleRate: rate };
	}
}

const SPOKEN: Spoken[] = [
	{ start: 0.6, end: 1.4 },
	{ start: 1.6, end: 2.5 },
	{ start: 3.4, end: 4.2 }
];

/** Every word accounted for, each within `slack` of where it was spoken. */
function expectWords(
	segments: { start: number; end: number }[],
	words: Spoken[],
	slack: { early: number; late: number }
) {
	expect(segments).toHaveLength(words.length);
	words.forEach((w, i) => {
		// A word may be opened early and closed late — never the other way round,
		// which is the cut landing inside it.
		expect(segments[i].start).toBeLessThanOrEqual(w.start + 0.02);
		expect(segments[i].start).toBeGreaterThanOrEqual(w.start - slack.early);
		expect(segments[i].end).toBeGreaterThanOrEqual(w.end - 0.02);
		expect(segments[i].end).toBeLessThanOrEqual(w.end + slack.late);
	});
}

describe('scanSpeech', () => {
	test('finds the words in a quiet room', async () => {
		const scan = await scanSpeech(take(SPOKEN, { floorDb: -60, duration: 5 }), { from: 0 });
		expect(scan.separated).toBe(true);
		expectWords(scan.segments, SPOKEN, { early: 0.12, late: 0.2 });
	});

	test('finds the same words in a room 22dB louder', async () => {
		const scan = await scanSpeech(take(SPOKEN, { floorDb: -38, duration: 5 }), { from: 0 });
		expect(scan.separated).toBe(true);
		expectWords(scan.segments, SPOKEN, { early: 0.12, late: 0.2 });
	});

	test('finds them in a quiet recording nobody normalized', async () => {
		const quiet = SPOKEN.map((w) => ({ ...w, level: 0.05 }));
		const scan = await scanSpeech(take(quiet, { floorDb: -78, duration: 5 }), { from: 0 });
		expectWords(scan.segments, quiet, { early: 0.12, late: 0.2 });
	});

	test('reads the gaps under a steady music bed', async () => {
		const scan = await scanSpeech(take(SPOKEN, { floorDb: -60, bedDb: -34, duration: 5 }), {
			from: 0
		});
		expect(scan.segments.length).toBe(SPOKEN.length);
	});

	test('keeps a word whole across the closure inside it', async () => {
		// "sta-p": 40ms of nothing in the middle of one word is not a pause.
		const scan = await scanSpeech(
			take(
				[
					{ start: 1, end: 1.4 },
					{ start: 1.44, end: 1.7 }
				],
				{ floorDb: -60, duration: 3 }
			),
			{ from: 0 }
		);
		expect(scan.segments).toHaveLength(1);
		expect(scan.segments[0].end).toBeGreaterThan(1.65);
	});

	test('a click is not a word', async () => {
		const scan = await scanSpeech(
			take(
				[
					{ start: 1, end: 1.02, level: 0.9 },
					{ start: 2, end: 2.6 }
				],
				{ floorDb: -60, duration: 3.5 }
			),
			{ from: 0 }
		);
		expect(scan.segments).toHaveLength(1);
		expect(scan.segments[0].start).toBeGreaterThan(1.5);
	});

	test('a room with nothing said in it holds no words', async () => {
		const scan = await scanSpeech(take([], { floorDb: -60, duration: 3 }), { from: 0 });
		expect(scan.segments).toEqual([]);
	});

	test('hears the same words however the range is windowed', async () => {
		const whole = await scanSpeech(take(SPOKEN, { floorDb: -50, duration: 5 }), { from: 0 });
		const part = await scanSpeech(take(SPOKEN, { floorDb: -50, duration: 5 }), { from: 3, to: 5 });
		const last = whole.segments[whole.segments.length - 1];
		expect(part.segments).toHaveLength(1);
		expect(part.segments[0].start).toBeCloseTo(last.start, 1);
		expect(part.segments[0].end).toBeCloseTo(last.end, 1);
	});
});

/** A percussive track: 20ms tone bursts every `period` seconds over silence. */
function clickTrack(seconds: number, period: number, first = 0.5): Float32Array {
	const data = new Float32Array(Math.round(seconds * RATE));
	const burst = Math.round(0.02 * RATE);
	for (let t = first; t < seconds - 0.05; t += period) {
		const start = Math.round(t * RATE);
		for (let i = 0; i < burst && start + i < data.length; i++) {
			data[start + i] = 0.9 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
		}
	}
	return data;
}

/** Feed `data` as mono chunks split every `every` seconds, timestamped from `at`. */
async function* beatPcm(data: Float32Array, every = 1, at = 0): AsyncGenerator<PcmChunk> {
	const per = Math.round(every * RATE);
	for (let start = 0; start < data.length; start += per) {
		yield {
			channels: [data.subarray(start, Math.min(data.length, start + per))],
			timestamp: at + start / RATE,
			sampleRate: RATE
		};
	}
}

/** How far each beat sits from its nearest click, worst case. */
function worstMiss(beats: number[], seconds: number, period: number, first = 0.5): number {
	const clicks: number[] = [];
	for (let t = first; t < seconds - 0.05; t += period) clicks.push(t);
	return Math.max(...beats.map((b) => Math.min(...clicks.map((c) => Math.abs(b - c)))));
}

/**
 * Edges are placed against the words, so the take below is written as words:
 * a sentence, a long pause, a sentence, a breath, a sentence, and open air
 * either end. Each case asks where a model-made edge should really sit.
 */

const word = (start: number, end: number): SpeechSegment => ({ start, end, peakDb: -18 });

const sentence: SpeechSegment[] = [
	word(1, 4), // first sentence
	word(5, 9), // second, a second of pause before it
	word(9.3, 12) // third, only a breath before it
];
const bounds = { from: 0, to: 20 };

const near = (n: number) => Math.round(n * 1000) / 1000;

describe("out edges (a clip's end)", () => {
	test("an edge in the pause sits the pace's air past the last word", () => {
		expect(placeEdge(sentence, 4.8, 'out', 'natural', bounds)).toEqual({
			t: near(4 + AIR.natural.out),
			placed: true,
			bound: 4
		});
	});

	test('an edge inside a word runs on until the word is whole', () => {
		expect(placeEdge(sentence, 3.6, 'out', 'natural', bounds).t).toBe(near(4 + AIR.natural.out));
	});

	test('pace changes the air and nothing else', () => {
		expect(placeEdge(sentence, 4.8, 'out', 'fast', bounds).t).toBe(near(4 + AIR.fast.out));
		expect(placeEdge(sentence, 4.8, 'out', 'relaxed', bounds).t).toBe(near(4 + AIR.relaxed.out));
	});

	test('a pause too short for the air stops clear of the next word', () => {
		// 0.3s of breath cannot hold a relaxed 0.45s tail, so the edge stops just
		// before the next word rather than eating its first syllable.
		const edge = placeEdge(sentence, 9.1, 'out', 'relaxed', bounds);
		expect(edge.t).toBeLessThan(9.3);
		expect(edge.t).toBeGreaterThanOrEqual(9 + MIN_AIR.out);
	});

	test('the fastest pace still lets the word finish', () => {
		const edge = placeEdge(sentence, 3.98, 'out', 'fast', bounds);
		expect(edge.t - 4).toBeGreaterThanOrEqual(MIN_AIR.out);
	});

	test('an edge out in open air pulls back to the last word', () => {
		expect(placeEdge(sentence, 13.5, 'out', 'natural', bounds).t).toBe(near(12 + AIR.natural.out));
	});

	test('no word within reach leaves the edge alone, flagged', () => {
		expect(placeEdge([word(1, 4)], 4 + REACH + 0.5, 'out', 'natural', bounds).placed).toBe(false);
	});

	test('with nothing after it the edge takes its full air', () => {
		expect(placeEdge([word(1, 4)], 4.1, 'out', 'relaxed', bounds).t).toBe(
			near(4 + AIR.relaxed.out)
		);
	});
});

describe("in edges (a clip's start)", () => {
	test("an edge in the pause leads the next word by the pace's air", () => {
		expect(placeEdge(sentence, 4.2, 'in', 'natural', bounds)).toEqual({
			t: near(5 - AIR.natural.in),
			placed: true,
			bound: 5
		});
	});

	test('an edge inside a word backs up so the word starts whole', () => {
		expect(placeEdge(sentence, 5.4, 'in', 'natural', bounds).t).toBe(near(5 - AIR.natural.in));
	});

	test("an edge at the source head trims the lead-in to the pace's air", () => {
		expect(placeEdge(sentence, 0, 'in', 'natural', bounds).t).toBe(near(1 - AIR.natural.in));
	});

	test('a breath too short for the air stops clear of the word before it', () => {
		const edge = placeEdge(sentence, 9.25, 'in', 'relaxed', bounds);
		expect(edge.t).toBeGreaterThan(9);
		expect(edge.t).toBeLessThanOrEqual(9.3 - MIN_AIR.in);
	});

	test('no word within reach leaves the edge alone, flagged', () => {
		expect(placeEdge([word(1, 4)], 1 - REACH - 0.5, 'in', 'natural', bounds).placed).toBe(false);
	});

	test('an edge past the last word has nothing to open on', () => {
		expect(placeEdge(sentence, 13, 'in', 'natural', bounds).placed).toBe(false);
	});
});

describe('a joint whose pause cannot hold both sides', () => {
	const out = { t: 4.26, placed: true, bound: 4 };
	const into = { t: 4.14, placed: true, bound: 4.3 };

	test('the two edges meet inside the pause', () => {
		const joint = settleJoint(out, into)!;
		expect(joint).toBeGreaterThanOrEqual(4 + Math.min(MIN_AIR.out, 0.3 * 0.6));
		expect(joint).toBeLessThanOrEqual(4.3 - Math.min(MIN_AIR.in, 0.3 * 0.4));
	});

	test('a pause of nothing at all still leaves each word whole', () => {
		const joint = settleJoint(
			{ t: 4.1, placed: true, bound: 4 },
			{ t: 4.02, placed: true, bound: 4.06 }
		)!;
		expect(joint).toBeGreaterThanOrEqual(4);
		expect(joint).toBeLessThanOrEqual(4.06);
	});

	test('words that overlap are not a pause, so there is no joint to settle', () => {
		expect(
			settleJoint({ t: 4.3, placed: true, bound: 4.3 }, { t: 4.1, placed: true, bound: 4.1 })
		).toBeNull();
	});
});

describe('refineRemovalRange', () => {
	const scan: SpeechScan = {
		segments: [
			{ start: 1, end: 2, peakDb: -18 },
			{ start: 2.6, end: 2.9, peakDb: -24 }, // the "um"
			{ start: 3.5, end: 5, peakDb: -18 }
		],
		from: 0,
		to: 6,
		floorDb: -60,
		speechDb: -18,
		onsetDb: -40,
		separated: true
	};

	test('moves a padded filler cut onto the words around it', () => {
		const refined = refineRemovalRange({ start: 2.56, end: 2.94 }, scan, 'natural', {
			start: 2.6,
			end: 2.9
		});
		expect(refined.start).toBeCloseTo(2 + AIR.natural.out, 3);
		expect(refined.end).toBeCloseTo(3.5 - AIR.natural.in, 3);
	});

	test('keeps the range when refining would uncover the words to remove', () => {
		const range = { start: 1.5, end: 1.8 };
		expect(refineRemovalRange(range, scan, 'natural', { start: 1.5, end: 1.8 })).toEqual(range);
	});

	test('keeps the range when no word is within reach', () => {
		const empty: SpeechScan = { ...scan, segments: [] };
		const range = { start: 2.5, end: 3 };
		expect(refineRemovalRange(range, empty)).toEqual(range);
	});

	test('speechFrom finds no words in a silent envelope', () => {
		const silent = speechFrom({ db: new Float32Array(100).fill(-100), from: 0, hop: 0.01, end: 1 });
		expect(silent.segments).toEqual([]);
	});
});
