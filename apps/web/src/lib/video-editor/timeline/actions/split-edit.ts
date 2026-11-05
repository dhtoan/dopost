import type { TimelineItem } from '../../project/types';
import { executeAtomic } from '../commands/command-store.svelte';
import { planSplitEdit } from '../split-edit';
import { timelineStore } from '../stores/timeline-store.svelte';
import { isTrackEffectivelyLocked } from '../utils/track-groups';
import { canDetachAudio, detachAudio } from './detach-audio';

export type SplitEditResult =
	| { ok: true; leadSeconds: number; tailSeconds: number }
	| { ok: false; reason: 'not-found' | 'locked' | 'no-audio' | 'retimed' };

function overlap(a: TimelineItem, b: TimelineItem): number {
	return Math.max(
		0,
		Math.min(a.from + a.durationInFrames, b.from + b.durationInFrames) - Math.max(a.from, b.from)
	);
}

/** The audio item a video clip's sound was detached into, if it has one. */
export function detachedAudioOf(picture: TimelineItem): TimelineItem | undefined {
	if (picture.type !== 'video' || !picture.audioDetached || !picture.linkedGroupId)
		return undefined;
	return timelineStore.items
		.filter(
			(item) =>
				item.type === 'audio' &&
				item.linkedGroupId === picture.linkedGroupId &&
				item.mediaId === picture.mediaId
		)
		.toSorted((a, b) => overlap(b, picture) - overlap(a, picture))[0];
}

/** Detach a clip's sound when it is still inside the picture; returns its audio item. */
function soundOf(picture: TimelineItem): TimelineItem | undefined {
	if (!picture.audioDetached && canDetachAudio(picture)) detachAudio(picture.id);
	const current = timelineStore.itemById.get(picture.id);
	return current ? detachedAudioOf(current) : undefined;
}

function neighbour(picture: TimelineItem, side: 'previous' | 'next'): TimelineItem | undefined {
	const end = picture.from + picture.durationInFrames;
	const candidates = timelineStore.items.filter(
		(item) =>
			item.id !== picture.id &&
			item.type === 'video' &&
			item.trackId === picture.trackId &&
			(side === 'previous' ? item.from + item.durationInFrames <= picture.from : item.from >= end)
	);
	return side === 'previous'
		? candidates.toSorted((a, b) => b.from + b.durationInFrames - (a.from + a.durationInFrames))[0]
		: candidates.toSorted((a, b) => a.from - b.from)[0];
}

/**
 * Set a video clip's split edit: its sound starts `leadSeconds` before the picture
 * (J-cut) and runs `tailSeconds` past it (L-cut). The clip's sound and its
 * neighbours' are detached as needed; the neighbours' sound is trimmed to meet it.
 * Zero puts a side back on the cut. One undo step.
 */
export function setSplitEdit(
	pictureId: string,
	request: { leadSeconds: number; tailSeconds: number }
): SplitEditResult {
	const picture = timelineStore.itemById.get(pictureId);
	if (!picture || picture.type !== 'video') return { ok: false, reason: 'not-found' };
	if (isTrackEffectivelyLocked(picture.trackId, timelineStore.tracks)) {
		return { ok: false, reason: 'locked' };
	}
	if (!picture.audioDetached && !canDetachAudio(picture)) return { ok: false, reason: 'no-audio' };
	const fps = timelineStore.fps;
	try {
		return executeAtomic('SET_SPLIT_EDIT', () => {
			const audio = soundOf(picture);
			if (!audio) throw new SplitEditRefused('no-audio');
			const near = (
				side: 'previous' | 'next'
			): { picture: TimelineItem; audio: TimelineItem } | undefined => {
				const other = neighbour(picture, side);
				if (!other || isTrackEffectivelyLocked(other.trackId, timelineStore.tracks)) return;
				const sound = soundOf(other);
				return sound ? { picture: other, audio: sound } : undefined;
			};
			const previous = near('previous');
			const next = near('next');
			const plan = planSplitEdit(
				{ fps, picture, audio, previous, next },
				{ lead: request.leadSeconds * fps, tail: request.tailSeconds * fps }
			);
			if (!plan) throw new SplitEditRefused('retimed');
			timelineStore._updateItems([
				{ id: audio.id, patch: plan.audio },
				...(previous && plan.previous ? [{ id: previous.audio.id, patch: plan.previous }] : []),
				...(next && plan.next ? [{ id: next.audio.id, patch: plan.next }] : [])
			]);
			return {
				ok: true as const,
				leadSeconds: Math.round((plan.lead / fps) * 100) / 100,
				tailSeconds: Math.round((plan.tail / fps) * 100) / 100
			};
		});
	} catch (error) {
		if (error instanceof SplitEditRefused) return { ok: false, reason: error.reason };
		throw error;
	}
}

/** The split edit a clip carries now, in seconds. */
export function splitEditOf(pictureId: string): { leadSeconds: number; tailSeconds: number } {
	const picture = timelineStore.itemById.get(pictureId);
	const audio = picture ? detachedAudioOf(picture) : undefined;
	if (!picture || !audio) return { leadSeconds: 0, tailSeconds: 0 };
	const fps = timelineStore.fps;
	const lead = Math.max(0, picture.from - audio.from);
	const tail = Math.max(
		0,
		audio.from + audio.durationInFrames - (picture.from + picture.durationInFrames)
	);
	return {
		leadSeconds: Math.round((lead / fps) * 100) / 100,
		tailSeconds: Math.round((tail / fps) * 100) / 100
	};
}

class SplitEditRefused extends Error {
	constructor(readonly reason: 'no-audio' | 'retimed') {
		super(reason);
	}
}
