// Adapted from Donkey Cut (site/src/cut/lib/blockSource.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: blocks are flat-colour
// background items plus a typed shot-list parser. See NOTICE.md.

import type { BackgroundPatternBackground, ProceduralBackground } from '../project/types';

// A blockout shot is a slot with nothing in it yet: a flat-colour background item
// that holds a shot's place and length on the timeline until the footage exists.
// It owns no file, so blocking out a cut stores and decodes nothing. It cuts, trims,
// moves and takes transitions like any other item, and filling it swaps in media at
// the same place and length. Nothing is drawn in the frame; the label lives on the
// timeline item, so a blocked-out cut previews and exports as plain colour, never as
// a caption describing itself.

export const BLOCKOUT_COLOR = '#161a22';
/** The most shots one blockout lays down, so a whole shot list is one undo step. */
export const BLOCKOUT_MAX_SHOTS = 160;
/** Length used when a shot-list line gives no duration. */
export const BLOCKOUT_DEFAULT_SECONDS = 3;
/** The longest single shot. */
export const BLOCKOUT_MAX_SECONDS = 600;

export interface BlockoutShot {
	seconds: number;
	label?: string;
	color?: string;
}

export interface PlannedBlockoutShot {
	from: number;
	durationInFrames: number;
	label: string;
	color: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// "4", "4s", "4.5 sec", "0:04", "1:02.5" followed by an optional label.
const LINE =
	/^\s*(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|seconds?|giây)?(?=\s|$|[-–—:|,])\s*[-–—:|,]?\s*(.*)$/i;

function clampSeconds(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return BLOCKOUT_DEFAULT_SECONDS;
	return Math.min(BLOCKOUT_MAX_SECONDS, value);
}

/** Read a typed shot list, one shot per line: an optional duration then an optional label. */
export function parseShotList(text: string): BlockoutShot[] {
	const shots: BlockoutShot[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const match = LINE.exec(line);
		if (match) {
			const minutes = match[1] ? Number(match[1]) : 0;
			const seconds = Number(match[2]!.replace(',', '.'));
			const label = match[3]!.trim();
			shots.push({
				seconds: clampSeconds(minutes * 60 + seconds),
				...(label ? { label } : {})
			});
		} else {
			shots.push({ seconds: BLOCKOUT_DEFAULT_SECONDS, label: line });
		}
		if (shots.length >= BLOCKOUT_MAX_SHOTS) break;
	}
	return shots;
}

/**
 * Lay shots end to end from `from`. Edges are rounded on the running total, so a
 * long list of fractional shots never drifts off the seconds it adds up to. Every
 * shot keeps at least one frame.
 */
export function planBlockout(
	shots: readonly BlockoutShot[],
	options: { fps: number; from: number }
): PlannedBlockoutShot[] {
	const fps = options.fps > 0 ? options.fps : 30;
	const start = Math.max(0, Math.round(options.from));
	const planned: PlannedBlockoutShot[] = [];
	let elapsed = 0;
	let edge = start;
	for (const [index, shot] of shots.slice(0, BLOCKOUT_MAX_SHOTS).entries()) {
		elapsed += clampSeconds(shot.seconds);
		const end = Math.max(edge + 1, start + Math.round(elapsed * fps));
		planned.push({
			from: edge,
			durationInFrames: end - edge,
			label: shot.label?.trim() || `Shot ${index + 1}`,
			color: shot.color && HEX_COLOR.test(shot.color) ? shot.color.toLowerCase() : BLOCKOUT_COLOR
		});
		edge = end;
	}
	return planned;
}

/** The background a blockout shot stands on: its colour, with no pattern drawn over it. */
export function blockoutBackground(color: string = BLOCKOUT_COLOR): BackgroundPatternBackground {
	return {
		kind: 'pattern',
		pattern: 'grid',
		foreground: color,
		background: color,
		scale: 1,
		rotation: 0,
		offsetX: 0,
		offsetY: 0,
		density: 0.5,
		foregroundOpacity: 0
	};
}

/** True for a background that is only a flat colour: a blockout shot waiting for footage. */
export function isBlockoutBackground(background: ProceduralBackground | undefined): boolean {
	return background?.kind === 'pattern' && background.foregroundOpacity === 0;
}
