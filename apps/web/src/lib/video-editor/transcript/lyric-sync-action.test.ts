import { beforeEach, describe, expect, it } from 'vitest';
import { commandHistory } from '../timeline/commands/command-store.svelte';
import { timelineStore } from '../timeline/stores/timeline-store.svelte';
import { captionTextOf, syncCaptionText } from './lyric-sync-action';

describe('syncCaptionText', () => {
	beforeEach(() => {
		commandHistory.clearHistory();
		timelineStore.setAll({
			fps: 30,
			currentFrame: 0,
			tracks: [
				{
					id: 'captions',
					name: 'Captions',
					kind: 'video',
					height: 48,
					locked: false,
					visible: true,
					muted: false,
					solo: false,
					order: 0
				}
			],
			items: [
				{
					id: 'subs',
					trackId: 'captions',
					from: 60,
					durationInFrames: 180,
					label: 'Captions',
					type: 'subtitle',
					captionSource: { type: 'subtitle-import', clipId: 'subs', mediaId: 'captions' },
					cues: [
						{
							id: 'a',
							startFrame: 90,
							endFrame: 132,
							text: 'hold on tide',
							words: [
								{ id: 'w1', startFrame: 90, endFrame: 102, text: 'hold' },
								{ id: 'w2', startFrame: 102, endFrame: 114, text: 'on' },
								{ id: 'w3', startFrame: 114, endFrame: 132, text: 'tide' }
							]
						}
					]
				}
			]
		});
	});

	it('offers the current wording as the draft', () => {
		expect(captionTextOf('subs')).toBe('hold on tide');
	});

	it("replaces the wording with the person's text on the heard clock, as one undo step", () => {
		expect(syncCaptionText('subs', 'Hold on tight')).toEqual({ ok: true, cues: 1 });
		const [cue] = timelineStore.itemById.get('subs')!.cues!;
		expect(cue).toMatchObject({ text: 'Hold on tight', startFrame: 90 });
		expect(cue!.words!.map((word) => word.text)).toEqual(['Hold', 'on', 'tight']);
		commandHistory.undo();
		expect(timelineStore.itemById.get('subs')!.cues![0]!.text).toBe('hold on tide');
	});

	it('refuses blank text and locked tracks without touching the cues', () => {
		expect(syncCaptionText('subs', ' \n ')).toEqual({ ok: false, reason: 'empty' });
		timelineStore._setTracks(timelineStore.tracks.map((track) => ({ ...track, locked: true })));
		expect(syncCaptionText('subs', 'x')).toEqual({ ok: false, reason: 'locked' });
		expect(syncCaptionText('missing', 'x')).toEqual({ ok: false, reason: 'not-found' });
		expect(captionTextOf('subs')).toBe('hold on tide');
	});
});
