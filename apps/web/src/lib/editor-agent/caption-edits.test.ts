import { describe, expect, it } from 'vitest';
import type { SubtitleCue } from '$lib/video-editor/project/types';
import {
	CAPTION_BATCH_MAX,
	CaptionEditError,
	cueTextList,
	deleteCue,
	languageLabel,
	mergeCueWithNext,
	retimeCue,
	setCueTexts,
	translatedCues,
	translatedLabel
} from './caption-edits';

function cues(): SubtitleCue[] {
	return [
		{
			id: 'a',
			startFrame: 0,
			endFrame: 30,
			text: 'Hello there',
			words: [
				{ id: 'w1', startFrame: 0, endFrame: 15, text: 'Hello' },
				{ id: 'w2', startFrame: 15, endFrame: 30, text: 'there' }
			]
		},
		{ id: 'b', startFrame: 30, endFrame: 60, text: 'how are' },
		{ id: 'c', startFrame: 70, endFrame: 90, text: 'you' }
	];
}

describe('agent caption edits', () => {
	it('accepts a cue list of known ids, once each', () => {
		expect(cueTextList([{ cue_id: 'b', text: 'x' }], cues(), 'cues')).toEqual([
			{ cue_id: 'b', text: 'x' }
		]);
		const bad = [
			[],
			[{ cue_id: 'z', text: 'x' }],
			[{ cue_id: 'a', text: '  ' }],
			[{ cue_id: 'a', text: 'x'.repeat(501) }],
			[
				{ cue_id: 'a', text: 'x' },
				{ cue_id: 'a', text: 'y' }
			],
			Array.from({ length: CAPTION_BATCH_MAX + 1 }, () => ({ cue_id: 'a', text: 'x' }))
		];
		for (const value of bad)
			expect(() => cueTextList(value, cues(), 'cues')).toThrow(CaptionEditError);
	});

	it('rewrites many cues and keeps timed words with the copy', () => {
		const before = cues();
		const next = setCueTexts(before, [
			{ cue_id: 'a', text: 'Hi there' },
			{ cue_id: 'c', text: 'you all' }
		]);
		expect(next.map((cue) => cue.text)).toEqual(['Hi there', 'how are', 'you all']);
		expect(next[0]!.words?.map((word) => [word.id, word.text])).toEqual([
			['w1', 'Hi'],
			['w2', 'there']
		]);
		expect(next[1]).toBe(before[1]);
		expect(next[2]!.words).toBeUndefined();
	});

	it('retimes a cue inside the item without overlapping neighbours', () => {
		const bounds = { start: 0, end: 120 };
		const next = retimeCue(cues(), 'c', 62, 100, bounds);
		expect(next[2]).toMatchObject({ id: 'c', startFrame: 62, endFrame: 100 });
		expect(() => retimeCue(cues(), 'c', 50, 100, bounds)).toThrow(/overlap cue b/);
		expect(() => retimeCue(cues(), 'c', 80, 130, bounds)).toThrow(/from 0 to 120/);
		expect(() => retimeCue(cues(), 'c', 80, 80, bounds)).toThrow(CaptionEditError);
		const words = retimeCue(cues(), 'a', 0, 20, bounds)[0]!.words!;
		expect(words.every((word) => word.endFrame <= 20)).toBe(true);
	});

	it('deletes a cue but never the last one', () => {
		expect(deleteCue(cues(), 'b').map((cue) => cue.id)).toEqual(['a', 'c']);
		expect(() => deleteCue([cues()[0]!], 'a')).toThrow(/clip.remove/);
		expect(() => deleteCue(cues(), 'z')).toThrow(/does not exist/);
	});

	it('merges a cue with the one after it', () => {
		const next = mergeCueWithNext(cues(), 'a');
		expect(next).toHaveLength(2);
		expect(next[0]).toMatchObject({
			id: 'a',
			startFrame: 0,
			endFrame: 60,
			text: 'Hello there how are'
		});
		expect(next[0]!.words).toHaveLength(2);
		expect(() => mergeCueWithNext(cues(), 'c')).toThrow(/last cue/);
	});

	it('translates every cue into a copy with new ids and no timed words', () => {
		let n = 0;
		const translations = [
			{ cue_id: 'a', text: 'Hola' },
			{ cue_id: 'b', text: 'cómo estás' },
			{ cue_id: 'c', text: 'tú' }
		];
		const next = translatedCues(cues(), translations, 100, () => `t${++n}`);
		expect(next).toEqual([
			{ id: 't1', startFrame: 100, endFrame: 130, text: 'Hola' },
			{ id: 't2', startFrame: 130, endFrame: 160, text: 'cómo estás' },
			{ id: 't3', startFrame: 170, endFrame: 190, text: 'tú' }
		]);
		expect(() => translatedCues(cues(), translations.slice(0, 2), 0)).toThrow(/missing 1, first c/);
	});

	it('labels the translated track', () => {
		expect(translatedLabel('Captions', 'Spanish')).toBe('Captions (Spanish)');
		expect(translatedLabel(undefined, 'French')).toBe('Captions (French)');
		expect(languageLabel('  German ')).toBe('German');
		expect(() => languageLabel('')).toThrow(CaptionEditError);
		expect(() => languageLabel('x'.repeat(41))).toThrow(CaptionEditError);
	});
});
