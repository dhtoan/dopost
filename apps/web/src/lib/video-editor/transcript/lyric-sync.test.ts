// Adapted from Donkey Cut (site/src/cut/lib/lyricSync.test.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. See NOTICE.md.

import { describe, expect, test } from 'vitest';
import type { SubtitleCue } from '../project/types';
import {
	alignWords,
	heardWordsFromCues,
	syncCaptionCues,
	syncLines,
	type TimedWord
} from './lyric-sync';

const heard = (pairs: [string, number, number][]): TimedWord[] =>
	pairs.map(([w, t0, t1]) => ({ w, t0, t1 }));

describe('alignWords', () => {
	test('matches through insertions and mishearings', () => {
		const a = ['i', 'got', 'half', 'of', 'my', 'clients'];
		const b = ['uh', 'i', 'got', 'hoff', 'of', 'my', 'clients'];
		expect(alignWords(a, b)).toEqual([1, 2, -1, 4, 5, 6]);
	});

	test('nothing in common matches nothing', () => {
		expect(alignWords(['red', 'blue'], ['cat', 'dog'])).toEqual([-1, -1]);
	});
});

describe('syncLines', () => {
	test('lines take the times of the words the recognizer heard', () => {
		const lines = ['Hold on tight', "We're going home"];
		const words = heard([
			['hold', 1, 1.4],
			['on', 1.4, 1.8],
			['tight', 1.8, 2.4],
			['were', 3, 3.4],
			['going', 3.4, 3.9],
			['home', 3.9, 4.6]
		]);
		const out = syncLines(lines, words, { from: 0, to: 6 });
		expect(out).toHaveLength(2);
		expect(out[0]!.start).toBeCloseTo(1, 2);
		expect(out[0]!.end).toBeCloseTo(2.4, 2);
		expect(out[1]!.start).toBeCloseTo(3, 2);
		expect(out[1]!.end).toBeCloseTo(4.6, 2);
	});

	test("the user's words are kept verbatim, whatever was heard", () => {
		const out = syncLines(
			["Don't stop believin'"],
			heard([
				['dont', 2, 2.5],
				['stop', 2.5, 3],
				['believing', 3, 4]
			]),
			{ from: 0, to: 5 }
		);
		expect(out[0]!.text).toBe("Don't stop believin'");
		expect(out[0]!.words?.map((w) => w.w)).toEqual(["Don't", 'stop', "believin'"]);
	});

	test('words nobody heard are interpolated between the ones that were', () => {
		const out = syncLines(
			['one two three four'],
			heard([
				['one', 0, 0.5],
				['four', 3.5, 4]
			]),
			{ from: 0, to: 5 }
		);
		const times = out[0]!.words!.map((w) => w.t0);
		expect(times[0]).toBeCloseTo(0, 2);
		expect(times[1]).toBeGreaterThan(0.5);
		expect(times[2]).toBeGreaterThan(times[1]);
		expect(times[3]).toBeCloseTo(3.5, 2);
	});

	test('lines stay in order, never overlap, and stay inside the span', () => {
		const out = syncLines(
			['a b', 'c d', 'e f'],
			heard([
				['a', 9, 9.2],
				['b', 1, 1.2],
				['e', 4, 4.5]
			]),
			{ from: 0, to: 6 }
		);
		for (let i = 0; i + 1 < out.length; i++)
			expect(out[i]!.end).toBeLessThanOrEqual(out[i + 1]!.start);
		expect(out[0]!.start).toBeGreaterThanOrEqual(0);
		expect(out[out.length - 1]!.end).toBeLessThanOrEqual(6);
	});

	test('a line whose end was never heard holds only as long as it reads', () => {
		// A short script against a long recording: the tail must not stretch to
		// the end of the source.
		const out = syncLines(
			['the opening line', 'a line nobody heard'],
			heard([
				['the', 1, 1.3],
				['opening', 1.3, 1.8],
				['line', 1.8, 2.2]
			]),
			{ from: 0, to: 600 }
		);
		expect(out[1]!.end - out[1]!.start).toBeLessThan(4);
		expect(out[1]!.end).toBeLessThan(10);
	});

	test('a line crowded against the end of the span stays inside it', () => {
		const out = syncLines(
			['early', 'late one'],
			heard([
				['early', 0.2, 0.6],
				['late', 5.9, 5.95],
				['one', 5.95, 6]
			]),
			{ from: 0, to: 6 }
		);
		for (const l of out) {
			expect(l.end).toBeLessThanOrEqual(6);
			expect(l.start).toBeGreaterThanOrEqual(0);
		}
	});

	test('a transcript with nothing recognizable still spreads the lines', () => {
		const out = syncLines(['first', 'second', 'third'], [], { from: 0, to: 9 });
		expect(out.map((l) => l.start)).toEqual([0, 3, 6]);
		expect(out[2]!.end).toBe(9);
	});
});

const cue = (
	start: number,
	end: number,
	text: string,
	words?: [string, number, number][]
): SubtitleCue => {
	const built: SubtitleCue = { id: text, startFrame: start, endFrame: end, text };
	if (words) {
		built.words = words.map(([w, s, e]) => ({ id: w, startFrame: s, endFrame: e, text: w }));
	}
	return built;
};

describe('heardWordsFromCues', () => {
	test("uses timed words, or spreads a cue's text across it", () => {
		expect(heardWordsFromCues([cue(0, 30, 'hi', [['hi', 0, 30]]), cue(30, 90, 'a b')], 30)).toEqual(
			[
				{ t0: 0, t1: 1, w: 'hi' },
				{ t0: 1, t1: 2, w: 'a' },
				{ t0: 2, t1: 3, w: 'b' }
			]
		);
	});
});

describe('syncCaptionCues', () => {
	const recognised = [
		cue(30, 72, 'hold on tight', [
			['hold', 30, 42],
			['on', 42, 54],
			['tight', 54, 72]
		]),
		cue(90, 138, 'were going home', [
			['were', 90, 102],
			['going', 102, 117],
			['home', 117, 138]
		])
	];

	test("puts the person's lines on the transcript's clock, in whole frames", () => {
		const out = syncCaptionCues(
			recognised,
			"Hold on tight\n\nWe're going home",
			{ start: 0, end: 180 },
			30
		);
		expect(out.map((c) => [c.text, c.startFrame, c.endFrame])).toEqual([
			['Hold on tight', 30, 72],
			["We're going home", 90, 138]
		]);
		expect(out[1]!.words!.map((w) => [w.text, w.startFrame, w.endFrame])).toEqual([
			["We're", 90, 102],
			['going', 102, 117],
			['home', 117, 138]
		]);
	});

	test('keeps cues and words ordered, whole and inside the bounds', () => {
		const out = syncCaptionCues(recognised, 'a b c d e f g h\ni j\nk', { start: 20, end: 100 }, 30);
		let cursor = 20;
		for (const c of out) {
			expect(Number.isInteger(c.startFrame) && Number.isInteger(c.endFrame)).toBe(true);
			expect(c.startFrame).toBeGreaterThanOrEqual(cursor);
			expect(c.endFrame).toBeGreaterThan(c.startFrame);
			expect(c.endFrame).toBeLessThanOrEqual(100);
			for (const w of c.words ?? []) {
				expect(w.startFrame).toBeGreaterThanOrEqual(c.startFrame);
				expect(w.endFrame).toBeLessThanOrEqual(c.endFrame);
				expect(w.endFrame).toBeGreaterThan(w.startFrame);
			}
			cursor = c.endFrame;
		}
	});

	test('blank text gives no cues', () => {
		expect(syncCaptionCues(recognised, '  \n ', { start: 0, end: 180 }, 30)).toEqual([]);
	});
});
