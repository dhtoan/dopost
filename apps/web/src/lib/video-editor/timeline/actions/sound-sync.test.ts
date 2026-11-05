import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SYNC_RATE } from '../../audio/sound-sync';
import { mediaPool } from '../../media/pool.svelte';
import type { MediaMetadata } from '../../media/types';
import { commandHistory } from '../commands/command-store.svelte';
import { timelineStore } from '../stores/timeline-store.svelte';
import { isSoundSyncPair, planRecordingPlacement, syncRecordingToCamera } from './sound-sync';

describe('planRecordingPlacement', () => {
	it('covers the camera clip from the matching recording second', () => {
		// Camera clip plays camera seconds 2..4 at timeline frame 60; recording = camera + 10.
		expect(
			planRecordingPlacement(
				{ from: 60, durationInFrames: 60, sourceStart: 60, sourceFps: 30 },
				{ sourceFps: 30 },
				10,
				100,
				30
			)
		).toEqual({ from: 60, durationInFrames: 60, sourceStart: 360, sourceEnd: 420 });
	});

	it('starts later when the recorder rolled after the camera', () => {
		expect(
			planRecordingPlacement(
				{ from: 0, durationInFrames: 90, sourceStart: 0, sourceFps: 30 },
				{ sourceFps: 48 },
				-1.5,
				100,
				30
			)
		).toEqual({ from: 45, durationInFrames: 45, sourceStart: 0, sourceEnd: 72 });
	});

	it('stops at the end of the recording and refuses no overlap', () => {
		const camera = { from: 0, durationInFrames: 300, sourceStart: 0, sourceFps: 30 };
		expect(planRecordingPlacement(camera, {}, 0, 4, 30)?.durationInFrames).toBe(120);
		expect(planRecordingPlacement(camera, {}, -20, 100, 30)).toBeNull();
		expect(planRecordingPlacement(camera, {}, 5, 4, 30)).toBeNull();
	});
});

function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

function speechLike(seconds: number, seed: number): Float32Array {
	const r = rng(seed);
	const out = new Float32Array(Math.round(seconds * SYNC_RATE));
	let i = 0;
	while (i < out.length) {
		const burst = Math.round((0.08 + r() * 0.3) * SYNC_RATE);
		const level = 0.1 + r() * 0.8;
		const pitch = 90 + r() * 200;
		for (let k = 0; k < burst && i < out.length; k++, i++) {
			const env = Math.sin((Math.PI * k) / burst);
			out[i] =
				level * env * (0.6 * Math.sin((2 * Math.PI * pitch * i) / SYNC_RATE) + 0.4 * (r() * 2 - 1));
		}
		i += Math.round((0.03 + r() * 0.4) * SYNC_RATE);
	}
	return out;
}

const media = (id: string, duration: number): MediaMetadata => ({
	id,
	storageType: 'cloud',
	remoteUrl: `/${id}`,
	fileName: `${id}.mp4`,
	fileSize: 1,
	mimeType: 'video/mp4',
	duration,
	width: 640,
	height: 360,
	fps: 30,
	codec: 'avc',
	audioCodec: 'aac',
	hasAudio: true,
	bitrate: 1,
	tags: []
});

describe('syncRecordingToCamera', () => {
	// The recorder rolled 6.4 s before the camera.
	const room = speechLike(70, 3);
	const lead = Math.round(6.4 * SYNC_RATE);
	const files = new Map([
		['cam', room.subarray(lead).map((v) => v * 0.3)],
		['rec', room],
		['other', speechLike(70, 99)]
	]);
	const decode = async (mediaId: string, from: number, to: number) => {
		const signal = files.get(mediaId)!;
		const lo = Math.min(signal.length, Math.round(from * SYNC_RATE));
		const hi = Math.min(signal.length, Math.round(to * SYNC_RATE));
		const data = signal.slice(lo, hi);
		return {
			duration: data.length / SYNC_RATE,
			length: data.length,
			numberOfChannels: 1,
			sampleRate: SYNC_RATE,
			getChannelData: () => data
		};
	};

	beforeEach(() => {
		mediaPool.loadAll([media('cam', 63.6), media('rec', 70), media('other', 70)]);
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
				},
				{
					id: 'a1',
					name: 'Audio',
					kind: 'audio',
					height: 72,
					locked: false,
					visible: true,
					muted: false,
					solo: false,
					order: 1
				}
			],
			items: [
				{
					id: 'camera',
					type: 'video',
					label: 'cam',
					trackId: 'v1',
					mediaId: 'cam',
					from: 30,
					durationInFrames: 600,
					sourceStart: 300,
					sourceEnd: 900,
					sourceDuration: 1908,
					sourceFps: 30
				},
				{
					id: 'recording',
					type: 'audio',
					label: 'rec',
					trackId: 'a1',
					mediaId: 'rec',
					from: 0,
					durationInFrames: 300,
					sourceStart: 0,
					sourceEnd: 300,
					sourceDuration: 2100,
					sourceFps: 30
				}
			]
		});
	});

	afterEach(() => {
		mediaPool.clear();
		timelineStore.__resetForTesting();
		commandHistory.clearHistory();
	});

	it('recognises a camera clip plus a separate recording', () => {
		const items = timelineStore.items;
		expect(isSoundSyncPair(items)).toBe(true);
		expect(isSoundSyncPair([items[0]!])).toBe(false);
	});

	it('moves the recording under the camera clip and mutes the camera, as one undo step', async () => {
		const result = await syncRecordingToCamera('camera', 'recording', { decode });
		expect(result).toMatchObject({ ok: true, refined: true });
		if (!result.ok) return;
		expect(Math.abs(result.offsetSeconds - 6.4)).toBeLessThan(0.002);
		// Camera second 10 is recording second 16.4: frame 492.
		expect(timelineStore.itemById.get('recording')).toMatchObject({
			from: 30,
			durationInFrames: 600,
			sourceStart: 492,
			sourceEnd: 1092,
			trackId: 'a1'
		});
		expect(timelineStore.itemById.get('camera')!.volume).toBe(0);
		commandHistory.undo();
		expect(timelineStore.itemById.get('recording')).toMatchObject({ from: 0, sourceStart: 0 });
		expect(timelineStore.itemById.get('camera')!.volume).toBeUndefined();
	});

	it('keeps the camera sound when asked', async () => {
		await syncRecordingToCamera('camera', 'recording', { decode, muteCamera: false });
		expect(timelineStore.itemById.get('camera')!.volume).toBeUndefined();
	});

	it('refuses an unrelated recording without moving anything', async () => {
		timelineStore._updateItems([{ id: 'recording', patch: { mediaId: 'other' } }]);
		expect(await syncRecordingToCamera('camera', 'recording', { decode })).toEqual({
			ok: false,
			reason: 'no-match'
		});
		expect(timelineStore.itemById.get('recording')).toMatchObject({ from: 0, sourceStart: 0 });
	});

	it('refuses retimed and locked clips before reading anything', async () => {
		const never = async () => {
			throw new Error('should not decode');
		};
		timelineStore._updateItems([{ id: 'camera', patch: { speed: 2 } }]);
		expect(await syncRecordingToCamera('camera', 'recording', { decode: never })).toEqual({
			ok: false,
			reason: 'retimed'
		});
		timelineStore._setTracks(timelineStore.tracks.map((track) => ({ ...track, locked: true })));
		expect(await syncRecordingToCamera('camera', 'recording', { decode: never })).toEqual({
			ok: false,
			reason: 'locked'
		});
	});

	it('reports a file it cannot read', async () => {
		const broken = async () => {
			throw new Error('bad file');
		};
		expect(await syncRecordingToCamera('camera', 'recording', { decode: broken })).toEqual({
			ok: false,
			reason: 'decode-failed'
		});
	});
});
