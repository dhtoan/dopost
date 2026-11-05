// Adapted from Donkey Cut (site/src/cut/lib/lyricSync.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: frame-based caption cues
// in and out (syncCaptionCues). See NOTICE.md.

import type { SubtitleCue } from '../project/types';
import type { CaptionFrameRange } from './caption-source-mapping';

// Syncing known text to a recording: the person has the lyrics or the script and
// the audio, and wants those exact words on screen when they are said or sung.
//
// The transcript says WHEN with good timing and WHAT with poor accuracy: singing,
// doubled vocals and music defeat a recognizer. The person's text says WHAT
// exactly. So the two are aligned word by word, the text is kept verbatim, and the
// transcript lends only its clock. Words the recognizer missed take interpolated
// times between the words around them, so a line still lands when half of it went
// unheard.

export interface TimedWord {
	t0: number;
	t1: number;
	w: string;
}

export interface TimedLine {
	start: number;
	end: number;
	text: string;
	words?: TimedWord[];
}

/** Comparison form of a word: letters and digits only, so "don't" matches "dont". */
const norm = (w: string): string =>
	w
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}]/gu, '');

const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;
const MIN_LINE_S = 0.4;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Word-for-word alignment of `a` onto `b` (Needleman–Wunsch). Returns, for each
 * index of `a`, the index it matched in `b`, or -1. Only equal words count as a
 * match, so a mismatched pair carried along the path never claims a time.
 */
export function alignWords(a: string[], b: string[]): number[] {
	const n = a.length;
	const m = b.length;
	const out = new Array<number>(n).fill(-1);
	if (n === 0 || m === 0) return out;
	const w = m + 1;
	const score = new Float32Array((n + 1) * w);
	for (let i = 1; i <= n; i++) score[i * w] = i * GAP;
	for (let j = 1; j <= m; j++) score[j] = j * GAP;
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const diag = score[(i - 1) * w + (j - 1)]! + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH);
			const up = score[(i - 1) * w + j]! + GAP;
			const left = score[i * w + (j - 1)]! + GAP;
			score[i * w + j] = Math.max(diag, up, left);
		}
	}
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		const here = score[i * w + j];
		const diag = score[(i - 1) * w + (j - 1)]! + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH);
		if (here === diag) {
			if (a[i - 1] === b[j - 1]) out[i - 1] = j - 1;
			i--;
			j--;
		} else if (here === score[(i - 1) * w + j]! + GAP) {
			i--;
		} else {
			j--;
		}
	}
	return out;
}

/**
 * The person's lines, timed against a transcript of the same audio. Lines come back
 * in order, non-overlapping, inside [from, to], each with per-word times so a
 * karaoke highlight has something to follow.
 */
export function syncLines(
	lines: string[],
	transcript: TimedWord[],
	span: { from: number; to: number }
): TimedLine[] {
	const kept = lines.map((l) => l.trim()).filter((l) => l.length > 0);
	if (kept.length === 0) return [];
	const from = Math.max(0, Math.min(span.from, span.to));
	const to = Math.max(span.from, span.to);

	const flat: { line: number; raw: string; key: string }[] = [];
	kept.forEach((line, li) => {
		for (const raw of line.split(/\s+/)) {
			const key = norm(raw);
			if (key.length > 0) flat.push({ line: li, raw, key });
		}
	});
	const heard = transcript
		.filter((x) => x.t1 > x.t0 - 1e-6 && norm(x.w).length > 0)
		.sort((x, y) => x.t0 - y.t0);
	const matched = alignWords(
		flat.map((f) => f.key),
		heard.map((h) => norm(h.w))
	);

	const t0 = new Array<number>(flat.length).fill(NaN);
	const t1 = new Array<number>(flat.length).fill(NaN);
	for (let k = 0; k < flat.length; k++) {
		const j = matched[k]!;
		if (j >= 0) {
			t0[k] = heard[j]!.t0;
			t1[k] = Math.max(heard[j]!.t1, heard[j]!.t0 + 0.05);
		}
	}
	const anchors = t0.map((v, k) => (Number.isNaN(v) ? -1 : k)).filter((k) => k >= 0);
	if (anchors.length === 0) {
		// Nothing was recognised: spread the lines evenly so there is a timed draft to nudge.
		const each = Math.max(MIN_LINE_S, (to - from) / kept.length);
		return kept.map((text, i) => ({
			start: round2(from + i * each),
			end: round2(Math.min(to, from + (i + 1) * each)),
			text
		}));
	}
	const fill = (loK: number, hiK: number, loT: number, hiT: number) => {
		const steps = hiK - loK;
		if (steps <= 0) return;
		const step = (hiT - loT) / steps;
		for (let k = loK + 1; k < hiK; k++) {
			t0[k] = loT + step * (k - loK);
			t1[k] = t0[k]! + step * 0.9;
		}
	};
	fill(-1, anchors[0]!, from, t0[anchors[0]!]!);
	for (let a = 0; a + 1 < anchors.length; a++)
		fill(anchors[a]!, anchors[a + 1]!, t1[anchors[a]!]!, t0[anchors[a + 1]!]!);
	const last = anchors[anchors.length - 1]!;
	fill(last, flat.length, t1[last]!, to);
	if (Number.isNaN(t0[flat.length - 1])) {
		t0[flat.length - 1] = t1[last]!;
		t1[flat.length - 1] = to;
	}

	const out: TimedLine[] = kept.map((text) => ({ start: NaN, end: NaN, text }));
	// A line that ends on interpolated time has no real end; it would otherwise run
	// to wherever the interpolation reached.
	const heardTail = kept.map(() => false);
	for (let k = 0; k < flat.length; k++) heardTail[flat[k]!.line] = matched[k]! >= 0;
	for (let k = 0; k < flat.length; k++) {
		const line = out[flat[k]!.line]!;
		const wordT0 = clamp(t0[k]!, from, to);
		const wordT1 = clamp(Math.max(t1[k]!, wordT0 + 0.05), from, to);
		line.start = Number.isNaN(line.start) ? wordT0 : Math.min(line.start, wordT0);
		line.end = Number.isNaN(line.end) ? wordT1 : Math.max(line.end, wordT1);
		(line.words ??= []).push({ t0: round2(wordT0), t1: round2(wordT1), w: flat[k]!.raw });
	}

	let cursor = from;
	for (let i = 0; i < out.length; i++) {
		const line = out[i]!;
		if (Number.isNaN(line.start)) line.start = cursor;
		line.start = clamp(Math.max(line.start, cursor), from, Math.max(from, to - MIN_LINE_S));
		const nextStart = out[i + 1]?.start;
		const ceiling = Number.isNaN(nextStart ?? NaN) ? to : Math.min(to, nextStart ?? to);
		if (!(line.end > line.start)) line.end = line.start + MIN_LINE_S;
		// A line nobody was heard finishing holds as long as it takes to read, no longer.
		if (!heardTail[i]) {
			const words = line.words?.length ?? line.text.split(/\s+/).length;
			line.end = Math.min(line.end, line.start + Math.max(1, 0.4 * words + 0.6));
		}
		line.end = clamp(
			Math.min(
				Math.max(line.end, line.start + MIN_LINE_S),
				Math.max(ceiling, line.start + MIN_LINE_S)
			),
			line.start,
			to
		);
		cursor = line.end;
		line.start = round2(line.start);
		line.end = round2(line.end);
	}
	return out;
}

/** The transcript clock a caption track carries: timed words, or each cue's text spread over it. */
export function heardWordsFromCues(cues: readonly SubtitleCue[], fps: number): TimedWord[] {
	const words: TimedWord[] = [];
	for (const cue of cues) {
		if (cue.words?.length) {
			for (const word of cue.words)
				words.push({ t0: word.startFrame / fps, t1: word.endFrame / fps, w: word.text });
			continue;
		}
		const tokens = cue.text.split(/\s+/).filter(Boolean);
		const step = (cue.endFrame - cue.startFrame) / fps / Math.max(1, tokens.length);
		tokens.forEach((w, i) => {
			const t0 = cue.startFrame / fps + i * step;
			words.push({ t0, t1: t0 + step, w });
		});
	}
	return words;
}

/**
 * Replace a caption track's wording with the person's own text, one cue per line,
 * timed by the words the transcript heard. Frames stay whole, inside `bounds`, in
 * order and never overlapping; every word keeps at least one frame where it can.
 */
export function syncCaptionCues(
	cues: readonly SubtitleCue[],
	text: string,
	bounds: CaptionFrameRange,
	fps: number
): SubtitleCue[] {
	const lines = text.split(/\r?\n/);
	const timed = syncLines(lines, heardWordsFromCues(cues, fps), {
		from: bounds.start / fps,
		to: bounds.end / fps
	});
	const out: SubtitleCue[] = [];
	let cursor = bounds.start;
	for (const line of timed) {
		const startFrame = Math.min(bounds.end - 1, Math.max(cursor, Math.round(line.start * fps)));
		const endFrame = Math.min(bounds.end, Math.max(startFrame + 1, Math.round(line.end * fps)));
		if (endFrame <= startFrame) break;
		const cue: SubtitleCue = { id: crypto.randomUUID(), startFrame, endFrame, text: line.text };
		if (line.words?.length) {
			let wordCursor = startFrame;
			cue.words = line.words.map((word, i, all) => {
				const remaining = all.length - i - 1;
				const latestStart = Math.max(startFrame, endFrame - 1 - remaining);
				const start = Math.min(latestStart, Math.max(wordCursor, Math.round(word.t0 * fps)));
				const end = Math.min(
					Math.max(start + 1, endFrame - remaining),
					Math.max(start + 1, Math.round(word.t1 * fps))
				);
				wordCursor = end;
				return { id: crypto.randomUUID(), startFrame: start, endFrame: end, text: word.w };
			});
		}
		out.push(cue);
		cursor = endFrame;
	}
	return out;
}
