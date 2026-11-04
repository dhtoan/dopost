import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaMetadata } from '../../types';
import {
	canStartFrom,
	clampSeconds,
	estimateMicrousd,
	formatUsd,
	generatedVideoFileName,
	isTerminalRun,
	isVideoAspectRatio,
	isVideoModelId,
	serverMediaId,
	type VideoGenerationRun,
	type VideoModel
} from './video-generation';

import { VideoGenerationService, type ImportVideo } from './video-generation-service.svelte';

const imported: { file: File; projectId: string; tags: string[] }[] = [];
const importVideo: ImportVideo = async (file, options) => {
	imported.push({ file, projectId: options.projectId, tags: options.tags ?? [] });
	return image({ id: `media-${imported.length}`, fileName: file.name, mimeType: 'video/mp4' });
};

const flash: VideoModel = {
	id: 'kling-4-flash',
	name: 'Kling 4.0 Flash',
	min_seconds: 3,
	max_seconds: 20,
	default_seconds: 5,
	aspect_ratios: ['16:9', '9:16', '1:1'],
	audio: false,
	microusd_per_second: 94_000
};
const pro: VideoModel = {
	...flash,
	id: 'kling-3-pro',
	name: 'Kling 3.0 Pro',
	max_seconds: 15,
	audio: true,
	microusd_per_second: 112_000,
	audio_microusd_per_second: 168_000
};

function image(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
	return {
		id: 'img',
		storageType: 'cloud',
		remoteUrl: '/media/0b6f3a52-1c1e-4c43-9e3f-1f6f0d7b2a10',
		fileName: 'frame.png',
		fileSize: 1,
		mimeType: 'image/png',
		duration: 0,
		width: 1280,
		height: 720,
		fps: 0,
		codec: '',
		bitrate: 0,
		tags: ['image'],
		...overrides
	};
}

function run(overrides: Partial<VideoGenerationRun> = {}): VideoGenerationRun {
	return {
		id: 'run-1',
		workspace_id: 'ws',
		project_id: 'p',
		prompt: 'a lamp',
		model: 'kling-4-flash',
		duration_seconds: 5,
		aspect_ratio: '16:9',
		generate_audio: false,
		source_media_id: '',
		state: 'queued',
		error_message: '',
		result_media_id: '',
		cost_microusd: null,
		billing_state: 'pending',
		created_at: '2026-11-05T00:00:00Z',
		...overrides
	};
}

describe('video generation helpers', () => {
	it('estimates list price and rounds it up to the cent', () => {
		expect(formatUsd(estimateMicrousd(flash, 5, false))).toBe('$0.47');
		expect(formatUsd(estimateMicrousd(pro, 10, false))).toBe('$1.12');
		expect(formatUsd(estimateMicrousd(pro, 10, true))).toBe('$1.68');
		expect(formatUsd(estimateMicrousd(flash, 5, true))).toBe('$0.47');
		expect(formatUsd(1)).toBe('$0.01');
	});

	it('keeps lengths inside the model range', () => {
		expect(clampSeconds(flash, 1)).toBe(3);
		expect(clampSeconds(pro, 30)).toBe(15);
		expect(clampSeconds(flash, 7.4)).toBe(7);
		expect(clampSeconds(flash, Number.NaN)).toBe(5);
	});

	it('only starts from cloud still images big enough for the models', () => {
		expect(serverMediaId(image())).toBe('0b6f3a52-1c1e-4c43-9e3f-1f6f0d7b2a10');
		expect(canStartFrom(image())).toBe(true);
		expect(canStartFrom(image({ storageType: 'workspace', remoteUrl: undefined }))).toBe(false);
		expect(canStartFrom(image({ mimeType: 'image/gif' }))).toBe(false);
		expect(canStartFrom(image({ width: 200 }))).toBe(false);
	});

	it('narrows ids and states', () => {
		expect(isVideoModelId('kling-3-pro')).toBe(true);
		expect(isVideoModelId('veo')).toBe(false);
		expect(isVideoAspectRatio('9:16')).toBe(true);
		expect(isVideoAspectRatio('21:9')).toBe(false);
		expect(isTerminalRun({ state: 'completed' })).toBe(true);
		expect(isTerminalRun({ state: 'generating' })).toBe(false);
		expect(generatedVideoFileName('abc')).toBe('ai-video-abc.mp4');
	});
});

describe('VideoGenerationService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		imported.length = 0;
	});
	afterEach(() => vi.useRealTimers());

	it('follows a run to completion and imports the clip once', async () => {
		const states = [
			run({ state: 'generating' }),
			run({ state: 'completed', result_media_id: 'm1' })
		];
		const api = {
			config: vi.fn(),
			create: vi.fn(async () => run()),
			get: vi.fn(async () => states.shift() ?? run({ state: 'completed', result_media_id: 'm1' })),
			list: vi.fn(async () => []),
			download: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' }))
		};
		const service = new VideoGenerationService(api, importVideo);
		await service.open('ws', { projectId: 'p' });
		await service.start({
			workspace_id: 'ws',
			project_id: 'p',
			prompt: 'a lamp',
			model: 'kling-4-flash',
			duration_seconds: 5,
			aspect_ratio: '16:9'
		});
		expect(service.runs[0]?.state).toBe('queued');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(service.runs[0]?.state).toBe('generating');
		await vi.advanceTimersByTimeAsync(5_000);
		expect(service.runs[0]?.state).toBe('completed');
		expect(api.download).toHaveBeenCalledWith('m1');
		expect(imported).toHaveLength(1);
		expect(imported[0]?.file.name).toBe('ai-video-run-1.mp4');
		expect(imported[0]?.projectId).toBe('p');
		expect(imported[0]?.tags).toContain('ai-generated');
		// No more polling once the run is finished.
		await vi.advanceTimersByTimeAsync(20_000);
		expect(api.get).toHaveBeenCalledTimes(2);
		service.close();
	});

	it('stops following runs when the project closes', async () => {
		const api = {
			config: vi.fn(),
			create: vi.fn(),
			get: vi.fn(async () => run({ state: 'generating' })),
			list: vi.fn(async () => [run({ state: 'generating' })]),
			download: vi.fn()
		};
		const service = new VideoGenerationService(api, importVideo);
		await service.open('ws', { projectId: 'p' });
		service.close();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(api.get).not.toHaveBeenCalled();
		expect(service.runs).toEqual([]);
	});
});
