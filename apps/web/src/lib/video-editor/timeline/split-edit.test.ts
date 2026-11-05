import { describe, expect, it } from 'vitest';
import { canSplitEdit, planSplitEdit, resizeAudioRange } from './split-edit';

const sound = (from: number, length: number, sourceStart: number, sourceDuration = 3000) => ({
	from,
	durationInFrames: length,
	sourceStart,
	sourceEnd: sourceStart + length,
	sourceDuration,
	sourceFps: 30
});
const picture = (from: number, length: number) => ({ from, durationInFrames: length });

describe('resizeAudioRange', () => {
	it('moves the source window with the timeline range', () => {
		expect(resizeAudioRange(sound(100, 50, 200), 30, 90, 160)).toEqual({
			from: 90,
			durationInFrames: 70,
			sourceStart: 190,
			sourceEnd: 260
		});
	});

	it('stops at the start and end of the source', () => {
		expect(resizeAudioRange(sound(100, 50, 5, 60), 30, 0, 400)).toEqual({
			from: 95,
			durationInFrames: 60,
			sourceStart: 0,
			sourceEnd: 60
		});
	});

	it('scales by speed and source rate', () => {
		const fast = { ...sound(100, 50, 200), speed: 2, sourceFps: 60 };
		expect(resizeAudioRange(fast, 30, 90, 150)).toMatchObject({ sourceStart: 160, sourceEnd: 400 });
	});

	it('refuses reversed and speed-ramped sound', () => {
		expect(canSplitEdit({ ...sound(0, 10, 0), isReversed: true }, 30)).toBe(false);
		expect(resizeAudioRange({ ...sound(0, 10, 0), isReversed: true }, 30, 0, 10)).toBeNull();
	});
});

describe('planSplitEdit', () => {
	const input = () => ({
		fps: 30,
		picture: picture(100, 60),
		audio: sound(100, 60, 300),
		previous: { picture: picture(40, 60), audio: sound(40, 60, 100) },
		next: { picture: picture(160, 60), audio: sound(160, 60, 500) }
	});

	it('J-cut: the sound starts early and the outgoing sound is trimmed to meet it', () => {
		const plan = planSplitEdit(input(), { lead: 12, tail: 0 })!;
		expect(plan.lead).toBe(12);
		expect(plan.audio).toEqual({
			from: 88,
			durationInFrames: 72,
			sourceStart: 288,
			sourceEnd: 360
		});
		expect(plan.previous).toEqual({
			from: 40,
			durationInFrames: 48,
			sourceStart: 100,
			sourceEnd: 148
		});
		expect(plan.next).toEqual({
			from: 160,
			durationInFrames: 60,
			sourceStart: 500,
			sourceEnd: 560
		});
	});

	it('L-cut: the sound runs on and the incoming sound starts later', () => {
		const plan = planSplitEdit(input(), { lead: 0, tail: 15 })!;
		expect(plan.tail).toBe(15);
		expect(plan.audio).toMatchObject({ from: 100, durationInFrames: 75 });
		expect(plan.next).toEqual({
			from: 175,
			durationInFrames: 45,
			sourceStart: 515,
			sourceEnd: 560
		});
	});

	it('setting zero puts the neighbour back on its own picture', () => {
		const before = input();
		before.audio = sound(88, 72, 288);
		before.previous.audio = sound(40, 48, 100);
		const plan = planSplitEdit(before, { lead: 0, tail: 0 })!;
		expect(plan.audio).toMatchObject({ from: 100, durationInFrames: 60, sourceStart: 300 });
		expect(plan.previous).toMatchObject({ from: 40, durationInFrames: 60, sourceEnd: 160 });
	});

	it('never swallows a neighbour whole and never runs before the source', () => {
		const plan = planSplitEdit(input(), { lead: 500, tail: 500 })!;
		expect(plan.audio.from).toBe(41);
		expect(plan.previous!.durationInFrames).toBe(1);
		expect(plan.audio.from + plan.audio.durationInFrames).toBe(219);
		expect(plan.next!.durationInFrames).toBe(1);

		const shortSource = { ...input(), audio: sound(100, 60, 6) };
		expect(planSplitEdit(shortSource, { lead: 30, tail: 0 })!.lead).toBe(6);
	});
});
