import type { Project, SubComposition, TimelineItem } from '$lib/video-editor/project/types';
import { boxTransform, centredTransform, type PlacedBox } from './placement';

/**
 * Auto Video and Documentary projects made before generated layers used centre
 * offsets placed them measured from the top-left corner, so every generated text and
 * motion layer sat half a frame towards the bottom right. This finds those layers by
 * the exact placement they were generated with, so anything a person has moved since
 * is left alone, and shifts them (with their position keyframes) to where they belong.
 * Running it again finds nothing.
 */

interface Canvas {
	width: number;
	height: number;
}

interface Shift {
	x: number;
	y: number;
}

interface LegacyLayout {
	old: { x: number; y: number; width: number; height: number };
	next: PlacedBox;
}

export interface LegacyPlacementRepair {
	items: Array<{ id: string; patch: Partial<TimelineItem> }>;
	compositions: Array<{ id: string; items: TimelineItem[] }>;
}

function close(value: number | undefined, expected: number): boolean {
	return value !== undefined && Math.abs(value - expected) < 0.5;
}

function legacyLayouts(item: TimelineItem, canvas: Canvas): LegacyLayout[] {
	const { width: W, height: H } = canvas;
	if (item.type === 'text' && item.id.endsWith('-text')) {
		return [
			// Auto Video scene text.
			{
				old: { x: W / 2, y: H / 2, width: W * 0.82, height: H * 0.56 },
				next: centredTransform(canvas, { width: W * 0.82, height: H * 0.56 })
			},
			// Documentary lower-third label.
			{
				old: { x: W * 0.08, y: H * 0.78, width: W * 0.54, height: H * 0.16 },
				next: boxTransform(canvas, {
					left: W * 0.06,
					top: H * 0.76,
					width: W * 0.54,
					height: H * 0.16
				})
			}
		];
	}
	if (item.type === 'text' && item.id.endsWith('-annotation')) {
		return [
			{
				old: { x: W * 0.72, y: H * 0.16, width: W * 0.42, height: H * 0.12 },
				next: boxTransform(canvas, {
					left: W * 0.52,
					top: H * 0.08,
					width: W * 0.42,
					height: H * 0.12
				})
			}
		];
	}
	if (item.type === 'composition' && item.id.endsWith('-motion-composition')) {
		return [
			{
				old: { x: W / 2, y: H / 2, width: W, height: H },
				next: centredTransform(canvas, canvas)
			}
		];
	}
	return [];
}

function legacyShift(item: TimelineItem, canvas: Canvas): Shift | null {
	const transform = item.transform;
	if (!transform) return null;
	for (const layout of legacyLayouts(item, canvas)) {
		if (
			close(transform.x, layout.old.x) &&
			close(transform.y, layout.old.y) &&
			close(transform.width, layout.old.width) &&
			close(transform.height, layout.old.height)
		) {
			return { x: layout.next.x - layout.old.x, y: layout.next.y - layout.old.y };
		}
	}
	return null;
}

function shiftedPatch(item: TimelineItem, shift: Shift): Partial<TimelineItem> {
	const patch: Partial<TimelineItem> = {
		transform: {
			...item.transform,
			x: (item.transform?.x ?? 0) + shift.x,
			y: (item.transform?.y ?? 0) + shift.y
		}
	};
	const keyframes = item.keyframes;
	if (keyframes?.x || keyframes?.y) {
		patch.keyframes = {
			...keyframes,
			...(keyframes.x && {
				x: { ...keyframes.x, values: keyframes.x.values.map((value) => value + shift.x) }
			}),
			...(keyframes.y && {
				y: { ...keyframes.y, values: keyframes.y.values.map((value) => value + shift.y) }
			})
		};
	}
	return patch;
}

export function planLegacyPlacementRepair(input: {
	items: readonly TimelineItem[];
	compositions: readonly SubComposition[];
	canvas: Canvas;
}): LegacyPlacementRepair {
	const repair: LegacyPlacementRepair = { items: [], compositions: [] };
	for (const item of input.items) {
		const shift = legacyShift(item, input.canvas);
		if (!shift) continue;
		repair.items.push({ id: item.id, patch: shiftedPatch(item, shift) });
		if (item.type !== 'composition') continue;

		// The motion layers inside were placed the same way. Only the ones it generated
		// (named after the composition) move; a layer someone added stays put.
		const composition = input.compositions.find((entry) => entry.id === item.compositionId);
		if (!composition) continue;
		const inner = { x: -composition.width / 2, y: -composition.height / 2 };
		repair.compositions.push({
			id: composition.id,
			items: composition.items.map((child) =>
				child.id.startsWith(`${composition.id}-`)
					? { ...child, ...shiftedPatch(child, inner) }
					: child
			)
		});
	}
	return repair;
}

/** Applies the repair to a stored project document (the schema 12 migration). */
export function repairLegacyPlacement(project: Project): Project {
	const timeline = project.timeline;
	if (!timeline) return project;
	const compositions = timeline.compositions ?? [];
	const repair = planLegacyPlacementRepair({
		items: timeline.items,
		compositions,
		canvas: { width: project.metadata.width, height: project.metadata.height }
	});
	if (repair.items.length === 0) return project;
	const patches = new Map(repair.items.map((entry) => [entry.id, entry.patch]));
	const innerItems = new Map(repair.compositions.map((entry) => [entry.id, entry.items]));
	return {
		...project,
		timeline: {
			...timeline,
			items: timeline.items.map((item) => {
				const patch = patches.get(item.id);
				return patch ? ({ ...item, ...patch } as TimelineItem) : item;
			}),
			...(timeline.compositions && {
				compositions: timeline.compositions.map((composition) => {
					const items = innerItems.get(composition.id);
					return items ? { ...composition, items } : composition;
				})
			})
		}
	};
}
