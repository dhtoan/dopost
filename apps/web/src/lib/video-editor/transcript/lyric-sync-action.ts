import { updateItemProperties } from '../timeline/actions/items';
import { timelineStore } from '../timeline/stores/timeline-store.svelte';
import { isTrackEffectivelyLocked } from '../timeline/utils/track-groups';
import { captionTimingBounds } from './caption-correction';
import { syncCaptionCues } from './lyric-sync';

export type CaptionTextSyncResult =
	| { ok: true; cues: number }
	| { ok: false; reason: 'not-found' | 'empty' | 'locked' };

/** The wording a caption track shows now, one cue per line: the draft the person corrects. */
export function captionTextOf(itemId: string): string {
	const item = timelineStore.itemById.get(itemId);
	return (item?.cues ?? []).map((cue) => cue.text.replace(/\s*\n\s*/g, ' ')).join('\n');
}

/**
 * Swap a caption track's wording for the person's exact lyrics or script, one cue
 * per line, keeping the timing the transcript heard. One undo step.
 */
export function syncCaptionText(itemId: string, text: string): CaptionTextSyncResult {
	const item = timelineStore.itemById.get(itemId);
	if (!item || item.type !== 'subtitle') return { ok: false, reason: 'not-found' };
	if (isTrackEffectivelyLocked(item.trackId, timelineStore.tracks)) {
		return { ok: false, reason: 'locked' };
	}
	const cues = syncCaptionCues(item.cues ?? [], text, captionTimingBounds(item), timelineStore.fps);
	if (cues.length === 0) return { ok: false, reason: 'empty' };
	updateItemProperties(item.id, { cues }, 'SYNC_CAPTION_TEXT');
	return { ok: true, cues: cues.length };
}
