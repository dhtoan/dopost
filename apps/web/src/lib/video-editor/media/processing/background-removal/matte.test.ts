import { describe, expect, it } from 'vitest';
import {
	MATTE_HIGH,
	MATTE_LOW,
	confidenceToAlpha,
	removedBackgroundFileName,
	segmentSize,
	writeMatte
} from './matte';
import { BackgroundRemovalService } from './background-removal.svelte';
import type { MediaMetadata } from '../../types';

function video(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
	return {
		id: 'm1',
		storageType: 'workspace',
		fileName: 'Talk.mp4',
		fileSize: 1,
		mimeType: 'video/mp4',
		duration: 12,
		width: 1920,
		height: 1080,
		fps: 30,
		codec: 'avc',
		bitrate: 0,
		tags: ['video'],
		...overrides
	};
}

describe('person matte', () => {
	it('ramps smoothly from background to person', () => {
		expect(confidenceToAlpha(0)).toBe(0);
		expect(confidenceToAlpha(MATTE_LOW)).toBe(0);
		expect(confidenceToAlpha((MATTE_LOW + MATTE_HIGH) / 2)).toBe(128);
		expect(confidenceToAlpha(MATTE_HIGH)).toBe(255);
		expect(confidenceToAlpha(1)).toBe(255);
		const steps = [0.35, 0.45, 0.55, 0.65].map(confidenceToAlpha);
		expect(steps).toEqual([...steps].sort((a, b) => a - b));
	});

	it('writes white pixels whose alpha is the matte', () => {
		const rgba = new Uint8ClampedArray(8);
		writeMatte(new Float32Array([0.1, 0.9]), rgba);
		expect([...rgba]).toEqual([255, 255, 255, 0, 255, 255, 255, 255]);
	});

	it('gives the segmenter a small copy with the frame shape', () => {
		expect(segmentSize(1920, 1080)).toEqual({ width: 455, height: 256 });
		expect(segmentSize(1080, 1920)).toEqual({ width: 256, height: 455 });
		expect(segmentSize(200, 100)).toEqual({ width: 200, height: 100 });
	});

	it('names the result after the source', () => {
		expect(removedBackgroundFileName('Talk.mp4')).toBe('Talk (no background).webm');
		expect(removedBackgroundFileName('clip')).toBe('clip (no background).webm');
	});

	it('offers removal for videos up to ten minutes that are not already cut out', () => {
		const service = new BackgroundRemovalService();
		expect(service.canRemoveBackground(video())).toBe(true);
		expect(service.canRemoveBackground(video({ mimeType: 'image/png' }))).toBe(false);
		expect(service.canRemoveBackground(video({ duration: 11 * 60 }))).toBe(false);
		expect(service.canRemoveBackground(video({ tags: ['video', 'background-removed'] }))).toBe(
			false
		);
	});
});
