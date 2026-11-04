import { describe, expect, it } from 'vitest';
import { boxTransform, centredTransform } from './placement';

describe('placement', () => {
	const canvas = { width: 1080, height: 1920 };

	it('centres a box at offset zero, as the editor positions items', () => {
		expect(centredTransform(canvas, { width: 800, height: 600 })).toEqual({
			x: 0,
			y: 0,
			width: 800,
			height: 600,
			opacity: 1
		});
	});

	it('turns a top-left box into a centre offset that stays inside the canvas', () => {
		const transform = boxTransform(canvas, { left: 0, top: 1600, width: 540, height: 320 });
		expect(transform).toMatchObject({ x: -270, y: 800 });
		expect(canvas.width / 2 + transform.x - transform.width / 2).toBe(0);
		expect(canvas.height / 2 + transform.y + transform.height / 2).toBe(1920);
	});
});
