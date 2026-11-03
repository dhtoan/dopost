// A split edit lets a clip's sound cross the picture cut. A lead (J-cut) starts the
// sound before its picture appears; a tail (L-cut) lets it run on over the next
// shot. Idea from Donkey Cut's set_split_edit (https://github.com/DonkeyCut/Donkey,
// Apache-2.0); dopost builds it from detached audio items instead of a playback
// property, so preview and export play it with no new code.
//
// Everything here is pure frame arithmetic over plain items. The sound moves; the
// picture never does. The neighbouring clip's sound is trimmed back to meet it, and
// grows back toward its own picture when a lead or tail is made shorter again.

import type { TimelineItem } from '../project/types';

type AudioTiming = Pick<
	TimelineItem,
	| 'from'
	| 'durationInFrames'
	| 'sourceStart'
	| 'sourceEnd'
	| 'sourceDuration'
	| 'sourceFps'
	| 'speed'
	| 'speedRamp'
	| 'isReversed'
>;

export interface AudioRangePatch {
	from: number;
	durationInFrames: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface SplitEditNeighbour {
	/** The neighbouring clip's picture. */
	picture: Pick<TimelineItem, 'from' | 'durationInFrames'>;
	/** The neighbouring clip's detached sound. */
	audio: AudioTiming;
}

export interface SplitEditInput {
	fps: number;
	picture: Pick<TimelineItem, 'from' | 'durationInFrames'>;
	audio: AudioTiming;
	previous?: SplitEditNeighbour;
	next?: SplitEditNeighbour;
}

export interface SplitEditPlan {
	audio: AudioRangePatch;
	previous?: AudioRangePatch;
	next?: AudioRangePatch;
	/** Frames actually given, after the source and the timeline's start had their say. */
	lead: number;
	tail: number;
}

/** Source frames per timeline frame, or null when the clip's timing is not a straight line. */
function sourceRate(item: AudioTiming, fps: number): number | null {
	if (item.isReversed || item.speedRamp?.length) return null;
	const speed = item.speed ?? 1;
	if (!(speed > 0)) return null;
	return ((item.sourceFps && item.sourceFps > 0 ? item.sourceFps : fps) / fps) * speed;
}

export function canSplitEdit(item: AudioTiming, fps: number): boolean {
	return sourceRate(item, fps) !== null;
}

/**
 * Re-range an audio item on the timeline, moving its source window with it. Asks
 * for [from, end) and gets the closest range the source can actually supply.
 */
export function resizeAudioRange(
	item: AudioTiming,
	fps: number,
	from: number,
	end: number
): AudioRangePatch | null {
	const rate = sourceRate(item, fps);
	if (rate === null) return null;
	const sourceStart = item.sourceStart ?? 0;
	const sourceDuration =
		item.sourceDuration ?? item.sourceEnd ?? sourceStart + item.durationInFrames * rate;
	const earliest = Math.max(0, item.from - Math.floor(sourceStart / rate + 1e-9));
	const nextFrom = Math.max(earliest, Math.round(from));
	const nextSourceStart = Math.max(0, sourceStart + (nextFrom - item.from) * rate);
	const latest = nextFrom + Math.floor((sourceDuration - nextSourceStart) / rate + 1e-9);
	const nextEnd = Math.min(latest, Math.round(end));
	if (nextEnd <= nextFrom) return null;
	return {
		from: nextFrom,
		durationInFrames: nextEnd - nextFrom,
		sourceStart: Math.round(nextSourceStart),
		sourceEnd: Math.min(sourceDuration, Math.round(nextSourceStart + (nextEnd - nextFrom) * rate))
	};
}

/**
 * Give a clip's sound `lead` frames before its picture and `tail` frames after it.
 * The previous clip's sound ends where this one starts; the next clip's sound
 * starts where this one ends. Zero puts that side back on the picture cut.
 */
export function planSplitEdit(
	input: SplitEditInput,
	request: { lead: number; tail: number }
): SplitEditPlan | null {
	const { fps, picture } = input;
	const pictureEnd = picture.from + picture.durationInFrames;
	// A neighbour's sound always keeps at least its first (or last) frame.
	const floor = input.previous ? input.previous.audio.from + 1 : 0;
	const ceiling = input.next
		? input.next.audio.from + input.next.audio.durationInFrames - 1
		: Number.POSITIVE_INFINITY;
	const audio = resizeAudioRange(
		input.audio,
		fps,
		Math.max(floor, picture.from - Math.max(0, Math.round(request.lead))),
		Math.min(ceiling, pictureEnd + Math.max(0, Math.round(request.tail)))
	);
	if (!audio) return null;
	const audioEnd = audio.from + audio.durationInFrames;
	const plan: SplitEditPlan = {
		audio,
		lead: Math.max(0, picture.from - audio.from),
		tail: Math.max(0, audioEnd - pictureEnd)
	};
	if (input.previous) {
		const { picture: before, audio: sound } = input.previous;
		const wanted = Math.max(
			sound.from + sound.durationInFrames,
			before.from + before.durationInFrames
		);
		const trimmed = resizeAudioRange(sound, fps, sound.from, Math.min(wanted, audio.from));
		if (trimmed) plan.previous = trimmed;
	}
	if (input.next) {
		const { picture: after, audio: sound } = input.next;
		const wanted = Math.min(sound.from, after.from);
		const trimmed = resizeAudioRange(
			sound,
			fps,
			Math.max(wanted, audioEnd),
			sound.from + sound.durationInFrames
		);
		if (trimmed) plan.next = trimmed;
	}
	return plan;
}
