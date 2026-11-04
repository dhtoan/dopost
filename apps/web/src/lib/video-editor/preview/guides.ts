// Adapted from Donkey Cut (site/src/cut/lib/guides.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: frame size instead
// of aspect ids, no custom lines. See NOTICE.md.

/**
 * Preview guides: lines and keep-out regions drawn over the program monitor
 * so titles, stickers and captions land where a phone will show them.
 * Geometry is in frame fractions (0..1 of width and height), so one preset
 * serves every frame size. Guides draw in the editor only; exports and
 * captured frames never carry them.
 */

export type GuideId = 'thirds' | 'center' | 'margins' | 'shortform';

/** Which part of a platform's UI a keep-out box covers. */
export type GuideRegion = 'topBar' | 'cropped' | 'actions' | 'caption';

/** A region the platform's own UI covers, as frame fractions. */
export interface GuideBox {
	x: number;
	y: number;
	w: number;
	h: number;
	region: GuideRegion;
}

/** Lines (frame fractions along one axis) and keep-out boxes to draw. */
export interface GuideGeometry {
	v: number[];
	h: number[];
	boxes: GuideBox[];
}

/** The rectangle left for graphics once every keep-out box is removed. */
export interface SafeArea {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface GuidePreset {
	id: GuideId;
	/** Phone UI is measured on a phone, so the preset fits portrait frames. */
	portraitOnly?: boolean;
	geometry: GuideGeometry;
}

/** Safe-margin inset, fraction of the frame. */
export const MARGIN_INSET = 0.05;

const phone = (px: number, of: 1080 | 1920) => px / of;

const GUIDE_PRESETS: readonly GuidePreset[] = [
	{ id: 'thirds', geometry: { v: [1 / 3, 2 / 3], h: [1 / 3, 2 / 3], boxes: [] } },
	{ id: 'center', geometry: { v: [0.5], h: [0.5], boxes: [] } },
	{
		id: 'margins',
		geometry: {
			v: [MARGIN_INSET, 1 - MARGIN_INSET],
			h: [MARGIN_INSET, 1 - MARGIN_INSET],
			boxes: []
		}
	},
	// The phone UI of TikTok, Instagram Reels and YouTube Shorts, merged into
	// one keep-out: each region is the widest of the three, measured on a
	// 1170×2532 phone and mapped onto the 1080×1920 frame. Reels and Shorts
	// crop 4.4% off each side; TikTok crops 1.4%.
	{
		id: 'shortform',
		portraitOnly: true,
		geometry: {
			v: [],
			h: [],
			boxes: [
				{ x: 0, y: 0, w: 1, h: phone(215, 1920), region: 'topBar' },
				{ x: 0, y: 0, w: phone(50, 1080), h: 1, region: 'cropped' },
				{ x: 1 - phone(50, 1080), y: 0, w: phone(50, 1080), h: 1, region: 'cropped' },
				{
					x: phone(895, 1080),
					y: phone(730, 1920),
					w: phone(185, 1080),
					h: phone(730, 1920),
					region: 'actions'
				},
				{ x: 0, y: phone(1460, 1920), w: 1, h: phone(460, 1920), region: 'caption' }
			]
		}
	}
];

export const GUIDE_IDS: readonly GuideId[] = GUIDE_PRESETS.map((preset) => preset.id);

export function isGuideId(value: unknown): value is GuideId {
	return typeof value === 'string' && (GUIDE_IDS as readonly string[]).includes(value);
}

/** The known guide ids in a stored list, in registry order, each once. */
export function sanitizeGuides(value: unknown): GuideId[] {
	if (!Array.isArray(value)) return [];
	return GUIDE_IDS.filter((id) => value.includes(id));
}

function preset(id: GuideId): GuidePreset {
	return GUIDE_PRESETS.find((candidate) => candidate.id === id)!;
}

/** Whether a preset applies to the frame: platform chrome fits portrait frames. */
export function guideFits(id: GuideId, width: number, height: number): boolean {
	return !preset(id).portraitOnly || height > width;
}

/** Every line and box of the guides that are on and fit the frame, merged. */
export function guideGeometry(
	ids: readonly GuideId[],
	width: number,
	height: number
): GuideGeometry {
	const out: GuideGeometry = { v: [], h: [], boxes: [] };
	for (const id of ids) {
		if (!guideFits(id, width, height)) continue;
		const geometry = preset(id).geometry;
		out.v.push(...geometry.v);
		out.h.push(...geometry.h);
		out.boxes.push(...geometry.boxes);
	}
	return out;
}

/** The frame minus every keep-out box and inside the safe margins, as one
 * rectangle; null when no active guide bounds anything. */
export function safeAreaOf(
	ids: readonly GuideId[],
	width: number,
	height: number
): SafeArea | null {
	let left = 0;
	let top = 0;
	let right = 1;
	let bottom = 1;
	let bounded = false;
	if (ids.includes('margins')) {
		left = top = MARGIN_INSET;
		right = bottom = 1 - MARGIN_INSET;
		bounded = true;
	}
	for (const box of guideGeometry(ids, width, height).boxes) {
		bounded = true;
		if (box.w >= 0.99) {
			if (box.y <= 0.01) top = Math.max(top, box.y + box.h);
			else bottom = Math.min(bottom, box.y);
		} else if (box.x + box.w >= 0.99) right = Math.min(right, box.x);
		else if (box.x <= 0.01) left = Math.max(left, box.x + box.w);
	}
	if (!bounded) return null;
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) };
}
