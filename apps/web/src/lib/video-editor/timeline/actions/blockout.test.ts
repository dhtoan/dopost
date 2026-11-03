import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaMetadata } from '../../media/types';
import { commandHistory } from '../commands/command-store.svelte';
import { timelineStore } from '../stores/timeline-store.svelte';
import { addBlockout, fillBlockoutShot, isBlockoutItem } from './blockout';

const clip = {
	id: 'clip',
	storageType: 'workspace',
	fileName: 'kitchen.mp4',
	fileSize: 10,
	mimeType: 'video/mp4',
	duration: 2,
	width: 1920,
	height: 1080,
	fps: 30,
	codec: 'h264',
	bitrate: 0,
	tags: ['video']
} satisfies MediaMetadata;

const still = {
	...clip,
	id: 'still',
	fileName: 'poster.png',
	mimeType: 'image/png',
	duration: 0,
	fps: 0,
	codec: 'png',
	tags: ['image']
} satisfies MediaMetadata;

describe('blockout actions', () => {
	beforeEach(() => {
		commandHistory.clearHistory();
		timelineStore.setAll({
			fps: 30,
			currentFrame: 30,
			tracks: [
				{
					id: 'video-1',
					name: 'Video',
					kind: 'video',
					height: 96,
					locked: false,
					visible: true,
					muted: false,
					solo: false,
					order: 0
				}
			],
			items: []
		});
	});

	it('lays a shot list down from the playhead as one undo step', () => {
		const ids = addBlockout([{ seconds: 4, label: 'wide' }, { seconds: 2 }, { seconds: 1 }]);
		expect(ids).toHaveLength(3);
		const items = ids.map((id) => timelineStore.itemById.get(id)!);
		expect(items.map((item) => [item.from, item.durationInFrames, item.label])).toEqual([
			[30, 120, 'wide'],
			[150, 60, 'Shot 2'],
			[210, 30, 'Shot 3']
		]);
		expect(new Set(items.map((item) => item.trackId))).toEqual(new Set(['video-1']));
		expect(items.every(isBlockoutItem)).toBe(true);
		expect(items.every((item) => item.mediaId === undefined)).toBe(true);
		commandHistory.undo();
		expect(timelineStore.items).toHaveLength(0);
	});

	it('fills a shot with a still at the same place, id and length', () => {
		const [first, second] = addBlockout([{ seconds: 4 }, { seconds: 3 }]);
		const result = fillBlockoutShot(second!, still);
		expect(result).toEqual({ ok: true, itemId: second, durationInFrames: 90 });
		expect(timelineStore.itemById.get(second!)).toMatchObject({
			type: 'image',
			mediaId: 'still',
			from: 150,
			durationInFrames: 90,
			trackId: 'video-1'
		});
		expect(isBlockoutItem(timelineStore.itemById.get(first!))).toBe(true);
		commandHistory.undo();
		expect(isBlockoutItem(timelineStore.itemById.get(second!))).toBe(true);
	});

	it('plays shorter footage to its end inside the slot', () => {
		const [shot] = addBlockout([{ seconds: 5 }]);
		const result = fillBlockoutShot(shot!, clip);
		expect(result).toMatchObject({ ok: true, durationInFrames: 60 });
		expect(timelineStore.itemById.get(shot!)).toMatchObject({
			type: 'video',
			sourceStart: 0,
			sourceEnd: 60
		});
	});

	it('trims longer footage to the slot', () => {
		const [shot] = addBlockout([{ seconds: 1 }]);
		fillBlockoutShot(shot!, { ...clip, duration: 10 });
		expect(timelineStore.itemById.get(shot!)).toMatchObject({
			durationInFrames: 30,
			sourceEnd: 30
		});
	});

	it('refuses audio, ordinary backgrounds and locked tracks', () => {
		const [shot] = addBlockout([{ seconds: 1 }]);
		expect(fillBlockoutShot(shot!, { ...clip, tags: ['audio'] })).toEqual({
			ok: false,
			reason: 'audio'
		});
		timelineStore._updateItems([
			{
				id: shot!,
				patch: {
					background: { ...timelineStore.itemById.get(shot!)!.background!, foregroundOpacity: 1 }
				} as never
			}
		]);
		expect(fillBlockoutShot(shot!, clip)).toEqual({ ok: false, reason: 'not-blockout' });
		const [locked] = addBlockout([{ seconds: 1 }], { frame: 600 });
		timelineStore._setTracks(timelineStore.tracks.map((track) => ({ ...track, locked: true })));
		expect(fillBlockoutShot(locked!, clip)).toEqual({ ok: false, reason: 'locked' });
	});
});
