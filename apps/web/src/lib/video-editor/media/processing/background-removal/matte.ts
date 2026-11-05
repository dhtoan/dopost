// Adapted from Donkey Cut (site/src/cut/lib/cutout.ts and removal/localBake.ts,
// commit cddf34f), Copyright 2026 Donkey, Apache-2.0. Modified for dopost: the
// matte becomes the clip's own alpha in a transparent WebM instead of a
// separate grayscale matte video. See NOTICE.md.

/**
 * Person mattes from the MediaPipe selfie segmenter, on-device. The segmenter
 * runs on a small copy of each frame (it resamples to 256 px anyway); its
 * person confidence becomes an alpha ramp, scaled up over the full frame.
 */

/** Below this confidence a pixel is background. */
export const MATTE_LOW = 0.3;
/** Above this confidence a pixel is fully kept. */
export const MATTE_HIGH = 0.7;
/** The short side of the copy the segmenter sees. */
export const SEGMENT_SHORT_SIDE = 256;

/** Smoothstep from background to person, so the edge is soft rather than stepped. */
export function confidenceToAlpha(confidence: number): number {
	const t = Math.min(1, Math.max(0, (confidence - MATTE_LOW) / (MATTE_HIGH - MATTE_LOW)));
	return Math.round(t * t * (3 - 2 * t) * 255);
}

/** Fill an RGBA buffer with white whose alpha is the person matte. */
export function writeMatte(confidence: Float32Array, rgba: Uint8ClampedArray): void {
	for (let i = 0; i < confidence.length; i++) {
		const o = i * 4;
		rgba[o] = 255;
		rgba[o + 1] = 255;
		rgba[o + 2] = 255;
		rgba[o + 3] = confidenceToAlpha(confidence[i] ?? 0);
	}
}

/** The segmenter copy's size: the short side at SEGMENT_SHORT_SIDE, aspect kept. */
export function segmentSize(width: number, height: number) {
	const scale = Math.min(1, SEGMENT_SHORT_SIDE / Math.max(1, Math.min(width, height)));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

/** "Talk.mp4" → "Talk (no background).webm". */
export function removedBackgroundFileName(fileName: string): string {
	const base = fileName.replace(/\.[^./\\]+$/, '') || 'video';
	return `${base} (no background).webm`;
}

/** The tag the media pool shows on a result, and the one that says it already has no background. */
export const BACKGROUND_REMOVED_TAG = 'background-removed';
