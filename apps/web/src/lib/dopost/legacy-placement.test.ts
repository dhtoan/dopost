import { describe, expect, it } from 'vitest';
import type { MotionSceneGraph } from '@dopost/motion';
import type { SubComposition, TimelineItem } from '$lib/video-editor/project/types';
import { buildMotionCompositionOverlays } from './motion/motion-composition';
import { planLegacyPlacementRepair } from './legacy-placement';

const canvas = { width: 1080, height: 1920 };

function graph(style: MotionSceneGraph['style']): MotionSceneGraph {
	return {
		schemaVersion: 1,
		style,
		seed: 12345,
		brief: {
			palette: ['#D7C3A3', '#171411', '#C92828'],
			typography: 'condensed-editorial-typewriter-label',
			cameraLanguage: 'locked-documentary-tabletop',
			motionSignature: 'paper-assembly-stop-motion',
			backgroundLanguage: 'archival-newsprint-paper',
			transitionLanguage: ['hard-cut', 'crossfade']
		},
		scenes: [
			{
				id: 'motion-scene-1',
				sourceSceneId: 'scene-1',
				visualIntent: 'motion-composition',
				startSeconds: 0,
				durationSeconds: 4,
				camera: {
					scaleFrom: 1,
					scaleTo: 1,
					xFrom: 0,
					xTo: 0,
					yFrom: 0,
					yTo: 0,
					rotationFrom: 0,
					rotationTo: 0
				},
				background: {
					rotationFrom: 0,
					rotationTo: 0,
					scaleFrom: 1,
					scaleTo: 1,
					offsetXFrom: 0,
					offsetXTo: 0,
					offsetYFrom: 0,
					offsetYTo: 0,
					smoothness: 0.4
				},
				text: { inPreset: 'cascade', outPreset: 'fade-down', intensity: 0.4, staggerFrames: 2 }
			}
		]
	};
}

/** The same item as the old generators placed it: measured from the top-left corner. */
function fromCorner(item: TimelineItem, size = canvas): TimelineItem {
	const dx = size.width / 2;
	const dy = size.height / 2;
	return {
		...item,
		transform: {
			...item.transform,
			x: (item.transform?.x ?? 0) + dx,
			y: (item.transform?.y ?? 0) + dy
		},
		keyframes: item.keyframes && {
			...item.keyframes,
			...(item.keyframes.x && {
				x: { ...item.keyframes.x, values: item.keyframes.x.values.map((value) => value + dx) }
			}),
			...(item.keyframes.y && {
				y: { ...item.keyframes.y, values: item.keyframes.y.values.map((value) => value + dy) }
			})
		}
	};
}

function positions(item: TimelineItem) {
	const round = (value: number | undefined) => Math.round((value ?? 0) * 1000) / 1000;
	return {
		id: item.id,
		x: round(item.transform?.x),
		y: round(item.transform?.y),
		keyX: item.keyframes?.x?.values.map(round),
		keyY: item.keyframes?.y?.values.map(round)
	};
}

function text(id: string, transform: TimelineItem['transform']): TimelineItem {
	return {
		id,
		trackId: 'track-video-overlay',
		from: 0,
		durationInFrames: 90,
		label: id,
		type: 'text',
		text: 'Scene',
		transform
	} as TimelineItem;
}

function apply(
	items: TimelineItem[],
	compositions: SubComposition[]
): { items: TimelineItem[]; compositions: SubComposition[] } {
	const repair = planLegacyPlacementRepair({ items, compositions, canvas });
	const patches = new Map(repair.items.map((entry) => [entry.id, entry.patch]));
	const inner = new Map(repair.compositions.map((entry) => [entry.id, entry.items]));
	return {
		items: items.map((item) => ({ ...item, ...patches.get(item.id) }) as TimelineItem),
		compositions: compositions.map((entry) => ({
			...entry,
			items: inner.get(entry.id) ?? entry.items
		}))
	};
}

describe('legacy placement repair', () => {
	it('centres old Auto Video scene text and moves its camera keyframes with it', () => {
		const legacy = {
			...text('scene-1-text', {
				x: 540,
				y: 960,
				width: 1080 * 0.82,
				height: 1920 * 0.56,
				opacity: 1
			}),
			keyframes: {
				x: { frames: [0, 89], values: [540, 560], ids: ['a', 'b'], easings: ['linear', 'linear'] }
			}
		} as TimelineItem;
		const [repaired] = apply([legacy], []).items;
		expect(positions(repaired!)).toEqual({
			id: 'scene-1-text',
			x: 0,
			y: 0,
			keyX: [0, 20],
			keyY: undefined
		});
	});

	it('moves old documentary labels and annotations to their lower-third and top-right boxes', () => {
		const { items } = apply(
			[
				text('beat-1-text', {
					x: 1080 * 0.08,
					y: 1920 * 0.78,
					width: 1080 * 0.54,
					height: 1920 * 0.16
				}),
				text('beat-1-annotation', {
					x: 1080 * 0.72,
					y: 1920 * 0.16,
					width: 1080 * 0.42,
					height: 1920 * 0.12
				})
			],
			[]
		);
		const [label, annotation] = items;
		// Left edge 6% in, top 76% down; the annotation's right edge 6% in from the right.
		expect(540 + label!.transform!.x! - label!.transform!.width! / 2).toBeCloseTo(1080 * 0.06);
		expect(960 + label!.transform!.y! - label!.transform!.height! / 2).toBeCloseTo(1920 * 0.76);
		expect(540 + annotation!.transform!.x! + annotation!.transform!.width! / 2).toBeCloseTo(
			1080 * 0.94
		);
		expect(960 + annotation!.transform!.y! - annotation!.transform!.height! / 2).toBeCloseTo(
			1920 * 0.08
		);
	});

	it.each(['documentary-paper-collage', 'editorial-fashion'] as const)(
		'restores old %s motion layers to exactly what the generator builds now',
		(style) => {
			const [overlay] = buildMotionCompositionOverlays({ graph: graph(style), ...canvas, fps: 30 });
			const current = overlay!;
			const userLayer = text(`${current.composition.id}`.replace('auno-', 'user-'), {
				x: 12,
				y: 34,
				width: 100,
				height: 50
			});
			const legacyComposition: SubComposition = {
				...current.composition,
				items: [...current.composition.items.map((item) => fromCorner(item)), userLayer]
			};
			const repaired = apply([fromCorner(current.item)], [legacyComposition]);

			expect(positions(repaired.items[0]!)).toEqual(positions(current.item));
			expect(repaired.compositions[0]!.items.map(positions)).toEqual([
				...current.composition.items.map(positions),
				positions(userLayer)
			]);
		}
	);

	it('leaves layers someone has moved, and finds nothing the second time', () => {
		const moved = text('scene-1-text', {
			x: 120,
			y: -300,
			width: 1080 * 0.82,
			height: 1920 * 0.56
		});
		expect(planLegacyPlacementRepair({ items: [moved], compositions: [], canvas }).items).toEqual(
			[]
		);

		const legacy = text('scene-1-text', {
			x: 540,
			y: 960,
			width: 1080 * 0.82,
			height: 1920 * 0.56
		});
		const once = apply([legacy], []);
		expect(planLegacyPlacementRepair({ ...once, canvas })).toEqual({ items: [], compositions: [] });
	});
});
