import { streamDecoded, syncSound, type SyncAnswer } from '../../audio/sound-sync';
import { mediaPool } from '../../media/pool.svelte';
import { decodeAudioRangeForAnalysis } from '../../media/silence';
import type { TimelineItem } from '../../project/types';
import { executeAtomic } from '../commands/command-store.svelte';
import { timelineStore } from '../stores/timeline-store.svelte';
import { isTrackEffectivelyLocked } from '../utils/track-groups';
import { ensureOpenTrackForRange } from './track-placement';

// Lining up a separately recorded sound (a lav, a field recorder) with a camera
// clip by what both microphones heard. The correlation lives in audio/sound-sync.ts;
// this places the recording so it plays the same moment the camera's picture shows.

/** Below this the best match barely beats the runner-up: a different take, or nothing in common. */
export const SOUND_SYNC_MIN_CONFIDENCE = 1.4;
/** How much of the camera's sound is compared. */
const CAMERA_WINDOW_S = 60;

export interface RecordingPlacement {
	from: number;
	durationInFrames: number;
	sourceStart: number;
	sourceEnd: number;
}

type Timed = Pick<TimelineItem, 'from' | 'durationInFrames' | 'sourceStart' | 'sourceFps'>;

/**
 * Where the recording goes so it covers the camera clip: recording seconds equal
 * camera source seconds plus `offsetSeconds`. A recorder that started late covers
 * the clip from the moment it was rolling. Null when the two never overlap.
 */
export function planRecordingPlacement(
	camera: Timed,
	recording: Pick<TimelineItem, 'sourceFps'>,
	offsetSeconds: number,
	recordingSeconds: number,
	fps: number
): RecordingPlacement | null {
	const cameraFps = camera.sourceFps && camera.sourceFps > 0 ? camera.sourceFps : fps;
	const recordingFps = recording.sourceFps && recording.sourceFps > 0 ? recording.sourceFps : fps;
	const heardAt = (camera.sourceStart ?? 0) / cameraFps + offsetSeconds;
	const late = heardAt < 0 ? Math.ceil(-heardAt * fps - 1e-9) : 0;
	const from = camera.from + late;
	const startSeconds = Math.max(0, heardAt + late / fps);
	const available = Math.floor((recordingSeconds - startSeconds) * fps + 1e-9);
	const durationInFrames = Math.min(camera.from + camera.durationInFrames - from, available);
	if (durationInFrames <= 0) return null;
	const sourceStart = Math.round(startSeconds * recordingFps);
	return {
		from,
		durationInFrames,
		sourceStart,
		sourceEnd: sourceStart + Math.round((durationInFrames / fps) * recordingFps)
	};
}

export type SoundSyncResult =
	| { ok: true; offsetSeconds: number; confidence: number; refined: boolean }
	| {
			ok: false;
			reason: 'not-found' | 'locked' | 'retimed' | 'no-match' | 'no-overlap' | 'decode-failed';
	  };

type Decode = (
	mediaId: string,
	from: number,
	to: number
) => ReturnType<typeof decodeAudioRangeForAnalysis>;

function straightTiming(item: TimelineItem): boolean {
	return (item.speed ?? 1) === 1 && !item.isReversed && !item.speedRamp?.length;
}

/** True when the pair is one video clip and one separate audio clip from another file. */
export function isSoundSyncPair(items: readonly TimelineItem[]): boolean {
	if (items.length !== 2) return false;
	const video = items.find((item) => item.type === 'video');
	const audio = items.find((item) => item.type === 'audio');
	return Boolean(video?.mediaId && audio?.mediaId && video.mediaId !== audio.mediaId);
}

/**
 * Move the recording so it plays in sync with the camera clip and covers it, as
 * one undo step. With `muteCamera`, the camera's own scratch sound goes silent.
 */
export async function syncRecordingToCamera(
	videoId: string,
	audioId: string,
	options: { muteCamera?: boolean; decode?: Decode; signal?: AbortSignal } = {}
): Promise<SoundSyncResult> {
	const camera = timelineStore.itemById.get(videoId);
	const recording = timelineStore.itemById.get(audioId);
	if (
		camera?.type !== 'video' ||
		recording?.type !== 'audio' ||
		!camera.mediaId ||
		!recording.mediaId
	) {
		return { ok: false, reason: 'not-found' };
	}
	if (
		isTrackEffectivelyLocked(camera.trackId, timelineStore.tracks) ||
		isTrackEffectivelyLocked(recording.trackId, timelineStore.tracks)
	) {
		return { ok: false, reason: 'locked' };
	}
	if (!straightTiming(camera) || !straightTiming(recording))
		return { ok: false, reason: 'retimed' };

	const fps = timelineStore.fps;
	const decode: Decode =
		options.decode ??
		((mediaId, from, to) => decodeAudioRangeForAnalysis(mediaId, from, to, options.signal));
	const cameraFps = camera.sourceFps && camera.sourceFps > 0 ? camera.sourceFps : fps;
	const recordingFps = recording.sourceFps && recording.sourceFps > 0 ? recording.sourceFps : fps;
	const cameraFrom = (camera.sourceStart ?? 0) / cameraFps;
	const cameraTo = cameraFrom + Math.min(CAMERA_WINDOW_S, camera.durationInFrames / fps);
	const recordingSeconds =
		mediaPool.get(recording.mediaId)?.duration || (recording.sourceDuration ?? 0) / recordingFps;
	const cameraMedia = camera.mediaId;
	const recordingMedia = recording.mediaId;

	let answer: SyncAnswer | null;
	try {
		answer = await syncSound(
			{
				camera: (from, to) => streamDecoded((a, b) => decode(cameraMedia, a, b), from, to),
				recording: (from, to) => streamDecoded((a, b) => decode(recordingMedia, a, b), from, to)
			},
			{ cameraFrom, cameraTo, recordingTo: recordingSeconds }
		);
	} catch (error) {
		if (options.signal?.aborted) throw error;
		return { ok: false, reason: 'decode-failed' };
	}
	if (!answer || answer.confidence < SOUND_SYNC_MIN_CONFIDENCE) {
		return { ok: false, reason: 'no-match' };
	}

	// The timeline may have changed while the files were read.
	const liveCamera = timelineStore.itemById.get(videoId);
	const liveRecording = timelineStore.itemById.get(audioId);
	if (!liveCamera || !liveRecording) return { ok: false, reason: 'not-found' };
	const placement = planRecordingPlacement(
		liveCamera,
		liveRecording,
		answer.offset,
		recordingSeconds,
		fps
	);
	if (!placement) return { ok: false, reason: 'no-overlap' };

	const offsetSeconds = Math.round(answer.offset * 1000) / 1000;
	const confidence = Math.round(answer.confidence * 10) / 10;
	const refined = answer.refined;
	return executeAtomic('SYNC_RECORDING_TO_CAMERA', () => {
		const track = ensureOpenTrackForRange({
			kind: 'audio',
			itemType: 'audio',
			from: placement.from,
			durationInFrames: placement.durationInFrames,
			label: liveRecording.label,
			preferredTrackId: liveRecording.trackId,
			ignoredItemIds: new Set([liveRecording.id])
		});
		const updates: Array<{ id: string; patch: Partial<TimelineItem> }> = [
			{ id: liveRecording.id, patch: { ...placement, trackId: track.id } }
		];
		if (options.muteCamera ?? true) {
			updates.push({ id: liveCamera.id, patch: { volume: 0 } });
			for (const item of timelineStore.items) {
				if (
					item.type === 'audio' &&
					item.id !== liveRecording.id &&
					item.mediaId === liveCamera.mediaId &&
					liveCamera.linkedGroupId &&
					item.linkedGroupId === liveCamera.linkedGroupId
				) {
					updates.push({ id: item.id, patch: { volume: 0 } });
				}
			}
		}
		timelineStore._updateItems(updates);
		return { ok: true as const, offsetSeconds, confidence, refined };
	});
}
