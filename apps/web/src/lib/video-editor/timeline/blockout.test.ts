import { describe, expect, it } from 'vitest';
import {
	BLOCKOUT_COLOR,
	BLOCKOUT_DEFAULT_SECONDS,
	BLOCKOUT_MAX_SECONDS,
	BLOCKOUT_MAX_SHOTS,
	blockoutBackground,
	isBlockoutBackground,
	parseShotList,
	planBlockout
} from './blockout';

describe('parseShotList', () => {
	it('reads a duration then a label from each line', () => {
		expect(
			parseShotList(
				'4 wide of the kitchen\n2.5s hands only\n0:06 - close up\n1,5 sec: reaction\n3giây cảnh mở'
			)
		).toEqual([
			{ seconds: 4, label: 'wide of the kitchen' },
			{ seconds: 2.5, label: 'hands only' },
			{ seconds: 6, label: 'close up' },
			{ seconds: 1.5, label: 'reaction' },
			{ seconds: 3, label: 'cảnh mở' }
		]);
	});

	it('gives label-only lines the default length and skips blank lines', () => {
		expect(parseShotList('\n  establishing shot \n\n5\n')).toEqual([
			{ seconds: BLOCKOUT_DEFAULT_SECONDS, label: 'establishing shot' },
			{ seconds: 5 }
		]);
	});

	it('keeps a number glued to a word as part of the label', () => {
		expect(parseShotList('4K drone pass')).toEqual([
			{ seconds: BLOCKOUT_DEFAULT_SECONDS, label: '4K drone pass' }
		]);
	});

	it('caps long shots and long lists', () => {
		expect(parseShotList('9999 forever')[0]!.seconds).toBe(BLOCKOUT_MAX_SECONDS);
		expect(parseShotList(Array(400).fill('1').join('\n'))).toHaveLength(BLOCKOUT_MAX_SHOTS);
	});
});

describe('planBlockout', () => {
	it('lays shots end to end without gaps or overlap', () => {
		const planned = planBlockout(
			[{ seconds: 4, label: 'wide' }, { seconds: 2.5 }, { seconds: 6, color: '#AA0000' }],
			{ fps: 30, from: 15 }
		);
		expect(planned).toEqual([
			{ from: 15, durationInFrames: 120, label: 'wide', color: BLOCKOUT_COLOR },
			{ from: 135, durationInFrames: 75, label: 'Shot 2', color: BLOCKOUT_COLOR },
			{ from: 210, durationInFrames: 180, label: 'Shot 3', color: '#aa0000' }
		]);
	});

	it('rounds on the running total so fractional shots never drift', () => {
		const planned = planBlockout(Array(30).fill({ seconds: 1 / 3 }), { fps: 24, from: 0 });
		const last = planned.at(-1)!;
		expect(last.from + last.durationInFrames).toBe(240);
		for (let i = 1; i < planned.length; i++)
			expect(planned[i]!.from).toBe(planned[i - 1]!.from + planned[i - 1]!.durationInFrames);
	});

	it('keeps every shot at least one frame and ignores bad colours', () => {
		const planned = planBlockout([{ seconds: 0.001, color: 'red' }, { seconds: 0.001 }], {
			fps: 30,
			from: 0
		});
		expect(planned.map((shot) => shot.durationInFrames)).toEqual([1, 1]);
		expect(planned[0]!.color).toBe(BLOCKOUT_COLOR);
	});
});

describe('blockoutBackground', () => {
	it('is a flat colour that the blockout check recognises', () => {
		const background = blockoutBackground('#123456');
		expect(background).toMatchObject({ background: '#123456', foregroundOpacity: 0 });
		expect(isBlockoutBackground(background)).toBe(true);
		expect(isBlockoutBackground({ ...background, foregroundOpacity: 1 })).toBe(false);
		expect(isBlockoutBackground(undefined)).toBe(false);
	});
});
