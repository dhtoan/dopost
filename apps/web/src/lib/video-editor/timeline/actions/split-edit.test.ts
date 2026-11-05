import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mediaPool } from '../../media/pool.svelte';
import type { TimelineItem } from '../../project/types';
import { commandHistory } from '../commands/command-store.svelte';
import { timelineStore } from '../stores/timeline-store.svelte';
import { detachedAudioOf, setSplitEdit, splitEditOf } from './split-edit';

const shot = (id: string, from: number, sourceStart: number): TimelineItem => ({
	id,
	type: 'video',
	label: id,
	trackId: 'v1',
	mediaId: 'cam',
	from,
	durationInFrames: 60,
	sourceStart,
	sourceEnd: sourceStart + 60,
	sourceDuration: 900,
	sourceFps: 30
});

describe('setSplitEdit', () => {
	beforeEach(() => {
		mediaPool.loadAll([
			{
				id: 'cam',
				storageType: 'cloud',
				remoteUrl: '/cam.mp4',
				fileName: 'cam.mp4',
				fileSize: 1,
				mimeType: 'video/mp4',
				duration: 30,
				width: 640,
				height: 360,
				fps: 30,
				codec: 'avc',
				audioCodec: 'aac',
				hasAudio: true,
				bitrate: 1,
				tags: []
			}
		]);
		timelineStore.setAll({
			fps: 30,
			tracks: [
				{
					id: 'v1',
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
			items: [shot('a', 0, 100), shot('b', 60, 400), shot('c', 120, 700)]
		});
	});

	afterEach(() => {
		mediaPool.clear();
		timelineStore.__resetForTesting();
		commandHistory.clearHistory();
	});

	it('gives a clip a lead, trimming the outgoing sound, as one undo step', () => {
		expect(setSplitEdit('b', { leadSeconds: 0.5, tailSeconds: 0 })).toEqual({
			ok: true,
			leadSeconds: 0.5,
			tailSeconds: 0
		});
		const b = timelineStore.itemById.get('b')!;
		const a = timelineStore.itemById.get('a')!;
		expect(b).toMatchObject({ from: 60, durationInFrames: 60, audioDetached: true });
		expect(detachedAudioOf(b)).toMatchObject({ from: 45, durationInFrames: 75, sourceStart: 385 });
		expect(detachedAudioOf(a)).toMatchObject({ from: 0, durationInFrames: 45, sourceEnd: 145 });
		expect(splitEditOf('b')).toEqual({ leadSeconds: 0.5, tailSeconds: 0 });

		commandHistory.undo();
		expect(timelineStore.items.filter((item) => item.type === 'audio')).toHaveLength(0);
		expect(timelineStore.itemById.get('b')!.audioDetached).toBeFalsy();
	});

	it('gives a clip a tail and clears it again', () => {
		setSplitEdit('b', { leadSeconds: 0, tailSeconds: 1 });
		const c = timelineStore.itemById.get('c')!;
		expect(detachedAudioOf(c)).toMatchObject({ from: 150, durationInFrames: 30, sourceStart: 730 });
		setSplitEdit('b', { leadSeconds: 0, tailSeconds: 0 });
		expect(detachedAudioOf(timelineStore.itemById.get('c')!)).toMatchObject({
			from: 120,
			durationInFrames: 60,
			sourceStart: 700
		});
		expect(splitEditOf('b')).toEqual({ leadSeconds: 0, tailSeconds: 0 });
	});

	it('refuses clips with no sound and locked tracks, changing nothing', () => {
		mediaPool.clear();
		expect(setSplitEdit('b', { leadSeconds: 1, tailSeconds: 0 })).toEqual({
			ok: false,
			reason: 'no-audio'
		});
		timelineStore._setTracks(timelineStore.tracks.map((track) => ({ ...track, locked: true })));
		expect(setSplitEdit('b', { leadSeconds: 1, tailSeconds: 0 })).toEqual({
			ok: false,
			reason: 'locked'
		});
		expect(timelineStore.items).toHaveLength(3);
	});
});
