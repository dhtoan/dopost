import { editorSession } from '../../editor.svelte';
import type { MediaMetadata } from '../../media/types';
import type { TimelineItem } from '../../project/types';
import {
	blockoutBackground,
	isBlockoutBackground,
	planBlockout,
	type BlockoutShot
} from '../blockout';
import { executeAtomic } from '../commands/command-store.svelte';
import { timelineStore } from '../stores/timeline-store.svelte';
import { effectiveMediaTracks, isTrackEffectivelyLocked } from '../utils/track-groups';
import { mediaTimelineItem } from './insert-media';
import { ensureOpenTrackForRange } from './track-placement';

/**
 * Lay a shot list down as flat-colour placeholder shots, end to end on one video
 * track from the playhead, as one undo step. Returns the new item ids in order.
 */
export function addBlockout(
	shots: readonly BlockoutShot[],
	placement: { frame?: number; preferredTrackId?: string } = {}
): string[] {
	const planned = planBlockout(shots, {
		fps: timelineStore.fps,
		from: placement.frame ?? timelineStore.currentFrame
	});
	if (planned.length === 0) return [];
	return executeAtomic('ADD_BLOCKOUT', () => {
		if (
			!effectiveMediaTracks(timelineStore.tracks).some(
				(track) => track.kind !== 'audio' && !track.locked
			)
		) {
			throw new Error('An unlocked visual track is required to block out shots.');
		}
		const from = planned[0]!.from;
		const last = planned.at(-1)!;
		const track = ensureOpenTrackForRange({
			kind: 'video',
			itemType: 'background',
			from,
			durationInFrames: last.from + last.durationInFrames - from,
			label: 'Blockout',
			preferredTrackId: placement.preferredTrackId
		});
		const width = editorSession.project?.metadata.width ?? 1920;
		const height = editorSession.project?.metadata.height ?? 1080;
		return planned.map((shot) => {
			const id = crypto.randomUUID();
			timelineStore._addItem({
				id,
				trackId: track.id,
				from: shot.from,
				durationInFrames: shot.durationInFrames,
				label: shot.label,
				type: 'background',
				background: blockoutBackground(shot.color),
				transform: { width, height, x: 0, y: 0, opacity: 1 }
			});
			return id;
		});
	});
}

export function isBlockoutItem(item: TimelineItem | undefined): boolean {
	return item?.type === 'background' && isBlockoutBackground(item.background);
}

export type FillBlockoutResult =
	| { ok: true; itemId: string; durationInFrames: number }
	| { ok: false; reason: 'not-found' | 'not-blockout' | 'locked' | 'audio' };

/**
 * Put footage in a blockout shot's place. The media takes the shot's slot, id and
 * length, so transitions, links and the cut around it stay as they were. Footage
 * shorter than the shot plays to its end and leaves the rest of the slot empty.
 */
export function fillBlockoutShot(itemId: string, media: MediaMetadata): FillBlockoutResult {
	const block = timelineStore.itemById.get(itemId);
	if (!block) return { ok: false, reason: 'not-found' };
	if (!isBlockoutItem(block)) return { ok: false, reason: 'not-blockout' };
	if (media.tags.includes('audio')) return { ok: false, reason: 'audio' };
	if (isTrackEffectivelyLocked(block.trackId, timelineStore.tracks)) {
		return { ok: false, reason: 'locked' };
	}
	const fps = timelineStore.fps;
	const next = mediaTimelineItem(media, {
		id: block.id,
		trackId: block.trackId,
		from: block.from,
		durationInFrames: block.durationInFrames,
		label: media.fileName
	});
	if (next.type === 'video' && next.sourceFps && next.sourceDuration) {
		const available = Math.max(1, Math.floor((next.sourceDuration * fps) / next.sourceFps));
		next.durationInFrames = Math.min(block.durationInFrames, available);
		next.sourceEnd = Math.min(
			next.sourceDuration,
			Math.max(1, Math.round((next.durationInFrames * next.sourceFps) / fps))
		);
	}
	if (block.originId) next.originId = block.originId;
	if (block.linkedGroupId) next.linkedGroupId = block.linkedGroupId;
	if (block.fadeIn !== undefined) next.fadeIn = block.fadeIn;
	if (block.fadeOut !== undefined) next.fadeOut = block.fadeOut;
	if (block.effects?.length) next.effects = block.effects;
	return executeAtomic('FILL_BLOCKOUT_SHOT', () => {
		timelineStore._setItems(
			timelineStore.items.map((item) => (item.id === block.id ? next : item))
		);
		return { ok: true, itemId: block.id, durationInFrames: next.durationInFrames };
	});
}
