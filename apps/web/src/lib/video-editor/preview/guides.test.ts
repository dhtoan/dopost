import { describe, expect, it } from 'vitest';
import { guideFits, guideGeometry, MARGIN_INSET, safeAreaOf, sanitizeGuides } from './guides';

describe('preview guides', () => {
	it('keeps known ids in registry order, once each', () => {
		expect(sanitizeGuides(['shortform', 'bogus', 'thirds', 'thirds'])).toEqual([
			'thirds',
			'shortform'
		]);
		expect(sanitizeGuides('thirds')).toEqual([]);
	});

	it('merges lines from every active guide', () => {
		const geometry = guideGeometry(['thirds', 'center'], 1920, 1080);
		expect(geometry.v).toEqual([1 / 3, 2 / 3, 0.5]);
		expect(geometry.h).toEqual([1 / 3, 2 / 3, 0.5]);
		expect(geometry.boxes).toEqual([]);
	});

	it('applies short-form keep-outs to portrait frames only', () => {
		expect(guideFits('shortform', 1080, 1920)).toBe(true);
		expect(guideFits('shortform', 1920, 1080)).toBe(false);
		expect(guideGeometry(['shortform'], 1920, 1080).boxes).toEqual([]);
		expect(guideGeometry(['shortform'], 1080, 1920).boxes).toHaveLength(5);
	});

	it('returns no safe area when nothing bounds the frame', () => {
		expect(safeAreaOf([], 1080, 1920)).toBeNull();
		expect(safeAreaOf(['thirds'], 1080, 1920)).toBeNull();
	});

	it('shrinks the safe area by margins and short-form chrome', () => {
		expect(safeAreaOf(['margins'], 1920, 1080)).toEqual({
			x: MARGIN_INSET,
			y: MARGIN_INSET,
			w: 0.9,
			h: 0.9
		});
		const area = safeAreaOf(['shortform'], 1080, 1920)!;
		expect(area.y).toBeCloseTo(215 / 1920, 2);
		expect(area.y + area.h).toBeCloseTo(1460 / 1920, 2);
		expect(area.x).toBeCloseTo(50 / 1080, 2);
		expect(area.x + area.w).toBeCloseTo(895 / 1080, 2);
	});
});
