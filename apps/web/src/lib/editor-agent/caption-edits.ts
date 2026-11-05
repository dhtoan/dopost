/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- These parsers are the MCP JSON boundary for caption actions, like the video executor that calls them. */
// Adapted from Donkey Cut (site/src/cut/components/SubtitlesPanel.tools.ts and
// the cue tools in site/src/cut/lib/aiTools.ts, commit cddf34f), Copyright 2026
// Donkey, Apache-2.0. Modified for dopost: pure cue edits behind the editor
// agent's video_edit actions; the agent writes translations itself instead of
// calling a translation service. See NOTICE.md.

/**
 * Caption cue edits for the editor agent. Every function takes a subtitle
 * item's cues and returns the next cues, or throws a CaptionEditError the
 * executor turns into an invalid-operation reply. Nothing here touches the
 * timeline store.
 */
import type { SubtitleCue } from '$lib/video-editor/project/types';
import type { CaptionFrameRange } from '$lib/video-editor/transcript/caption-source-mapping';
import {
	correctedCueTimingPatch,
	correctedCueWords
} from '$lib/video-editor/transcript/caption-correction';

/** One batch may rewrite or translate this many cues. */
export const CAPTION_BATCH_MAX = 400;
/** The longest single cue text the agent may write. */
export const CAPTION_TEXT_MAX = 500;
/** The longest language label on a translated track. */
export const CAPTION_LANGUAGE_MAX = 40;

export class CaptionEditError extends Error {}

export interface CueText {
	cue_id: string;
	text: string;
}

function fail(message: string): never {
	throw new CaptionEditError(message);
}

/** Validate a cue_id/text list: known ids, each once, bounded text. */
export function cueTextList(value: unknown, cues: readonly SubtitleCue[], name: string): CueText[] {
	if (!Array.isArray(value) || value.length < 1 || value.length > CAPTION_BATCH_MAX)
		fail(`${name} must list 1 to ${CAPTION_BATCH_MAX} cues`);
	const known = new Set(cues.map((cue) => cue.id));
	const seen = new Set<string>();
	return value.map((entry: unknown, index) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry))
			fail(`${name}[${index}] must be an object with cue_id and text`);
		const { cue_id: cueID, text } = entry as Record<string, unknown>;
		if (typeof cueID !== 'string' || !known.has(cueID))
			fail(`${name}[${index}].cue_id is not a cue of this caption item`);
		if (seen.has(cueID)) fail(`${name} lists cue ${cueID} more than once`);
		seen.add(cueID);
		if (typeof text !== 'string' || text.trim() === '')
			fail(`${name}[${index}].text must not be empty`);
		if (text.length > CAPTION_TEXT_MAX)
			fail(`${name}[${index}].text must be at most ${CAPTION_TEXT_MAX} characters`);
		return { cue_id: cueID, text };
	});
}

/** Rewrite many cue texts at once; timed words follow the new copy. */
export function setCueTexts(
	cues: readonly SubtitleCue[],
	edits: readonly CueText[]
): SubtitleCue[] {
	const next = new Map(edits.map((edit) => [edit.cue_id, edit.text]));
	return cues.map((cue) => {
		const text = next.get(cue.id);
		if (text === undefined || text === cue.text) return cue;
		const words = correctedCueWords(cue, text);
		const { words: _old, ...rest } = cue;
		return words ? { ...rest, text, words } : { ...rest, text };
	});
}

function cueIndex(cues: readonly SubtitleCue[], cueID: string): number {
	const index = cues.findIndex((cue) => cue.id === cueID);
	if (index < 0) fail(`Subtitle cue ${cueID} does not exist`);
	return index;
}

/**
 * Move one cue's start and end, in the same frames the item's cues use. It
 * stays inside the item and may not overlap its neighbours.
 */
export function retimeCue(
	cues: readonly SubtitleCue[],
	cueID: string,
	startFrame: number,
	endFrame: number,
	bounds: CaptionFrameRange
): SubtitleCue[] {
	const index = cueIndex(cues, cueID);
	const cue = cues[index]!;
	const patch = correctedCueTimingPatch(cue, startFrame, endFrame, bounds);
	if (!patch)
		fail(
			`Cue frames must be whole numbers with start < end, from ${bounds.start} to ${bounds.end}`
		);
	const ordered = cues
		.map((entry, position) => ({ entry, position }))
		.filter(({ position }) => position !== index);
	const overlap = ordered.find(
		({ entry }) => entry.startFrame < patch.endFrame && entry.endFrame > patch.startFrame
	);
	if (overlap) fail(`Cue ${cueID} would overlap cue ${overlap.entry.id}`);
	return cues
		.map((entry, position) => (position === index ? { ...entry, ...patch } : entry))
		.toSorted((left, right) => left.startFrame - right.startFrame);
}

/** Remove one cue. The last cue stays: remove the whole item instead. */
export function deleteCue(cues: readonly SubtitleCue[], cueID: string): SubtitleCue[] {
	const index = cueIndex(cues, cueID);
	if (cues.length === 1)
		fail('This is the only cue; remove the caption item with clip.remove instead');
	return cues.filter((_, position) => position !== index);
}

/** Join one cue with the cue right after it: one span, both texts, both word lists. */
export function mergeCueWithNext(cues: readonly SubtitleCue[], cueID: string): SubtitleCue[] {
	const ordered = cues.toSorted((left, right) => left.startFrame - right.startFrame);
	const index = cueIndex(ordered, cueID);
	const first = ordered[index]!;
	const second = ordered[index + 1];
	if (!second) fail(`Cue ${cueID} is the last cue; there is no following cue to merge`);
	const words =
		first.words || second.words ? [...(first.words ?? []), ...(second.words ?? [])] : undefined;
	const merged: SubtitleCue = {
		id: first.id,
		startFrame: first.startFrame,
		endFrame: Math.max(first.endFrame, second.endFrame),
		text: `${first.text.trimEnd()} ${second.text.trimStart()}`
	};
	if (words) merged.words = words;
	return [...ordered.slice(0, index), merged, ...ordered.slice(index + 2)];
}

/**
 * A translated copy of every cue: the same timing moved by `offset` frames
 * (into the copy's own frame space), the agent's text, new ids, and no timed
 * words, since source words do not line up with a translation.
 */
export function translatedCues(
	cues: readonly SubtitleCue[],
	translations: readonly CueText[],
	offset: number,
	createId: () => string = () => crypto.randomUUID()
): SubtitleCue[] {
	const byID = new Map(translations.map((entry) => [entry.cue_id, entry.text]));
	const missing = cues.filter((cue) => !byID.has(cue.id));
	if (missing.length > 0)
		fail(`translations must cover every cue; missing ${missing.length}, first ${missing[0]!.id}`);
	return cues.map((cue) => ({
		id: createId(),
		startFrame: cue.startFrame + offset,
		endFrame: cue.endFrame + offset,
		text: byID.get(cue.id)!
	}));
}

/** "Captions" + "Spanish" → "Captions (Spanish)". */
export function translatedLabel(label: string | undefined, language: string): string {
	return `${(label ?? '').trim() || 'Captions'} (${language})`;
}

export function languageLabel(value: unknown): string {
	if (typeof value !== 'string' || value.trim() === '') fail('language is required');
	const trimmed = value.trim();
	if (trimmed.length > CAPTION_LANGUAGE_MAX)
		fail(`language must be at most ${CAPTION_LANGUAGE_MAX} characters`);
	return trimmed;
}
