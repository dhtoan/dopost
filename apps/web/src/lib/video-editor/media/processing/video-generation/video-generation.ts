// Adapted from Donkey Cut (site/src/cut/lib/generate.ts and components/GeneratePanel.tsx,
// commit cddf34f), Copyright 2026 Donkey, Apache-2.0. Modified for dopost: runs go
// through dopost's own server and fal key, and land as ordinary project media. See NOTICE.md.

/**
 * AI video generation for the Video Editor. The server owns the paid request
 * (one submission, receipt polling, cost); the browser only starts a run,
 * watches it, and imports the finished clip into the open project once.
 */
import type { components } from '@openpost/api-contract';
import type { MediaMetadata } from '../../types';

export type VideoGenerationRequest = components['schemas']['VideoGenerationRequest'];
export type VideoGenerationRun = components['schemas']['VideoGenerationRun'];
export type VideoModel = components['schemas']['VideoModel'];
export type VideoGenerationConfig = components['schemas']['VideoGenerationConfigOutputBody'];

export type VideoModelId = VideoGenerationRequest['model'];
export type VideoAspectRatio = VideoGenerationRequest['aspect_ratio'];

const VIDEO_MODEL_IDS: readonly string[] = [
	'kling-4-flash',
	'kling-3-pro'
] satisfies VideoModelId[];
const VIDEO_ASPECT_RATIOS: readonly string[] = ['16:9', '9:16', '1:1'] satisfies VideoAspectRatio[];

export function isVideoModelId(value: string): value is VideoModelId {
	return VIDEO_MODEL_IDS.includes(value);
}

export function isVideoAspectRatio(value: string): value is VideoAspectRatio {
	return VIDEO_ASPECT_RATIOS.includes(value);
}

/** States after which the server will not change a run any more. */
const TERMINAL_STATES = new Set(['completed', 'failed', 'unknown']);
/** The longest prompt the server accepts. */
export const VIDEO_PROMPT_MAX = 2500;

export function isTerminalRun(run: Pick<VideoGenerationRun, 'state'>): boolean {
	return TERMINAL_STATES.has(run.state);
}

/** List price for one generation, in micro-USD; billing itself is fal's. */
export function estimateMicrousd(model: VideoModel, seconds: number, audio: boolean): number {
	const rate =
		audio && model.audio && model.audio_microusd_per_second
			? model.audio_microusd_per_second
			: model.microusd_per_second;
	return rate * seconds;
}

/** "$0.47" from micro-USD, rounded up to the cent so an estimate never reads low. */
export function formatUsd(microusd: number): string {
	return `$${(Math.ceil(microusd / 10_000) / 100).toFixed(2)}`;
}

/** Clamp a requested length into what the model takes. */
export function clampSeconds(model: VideoModel, seconds: number): number {
	if (!Number.isFinite(seconds)) return model.default_seconds;
	return Math.min(model.max_seconds, Math.max(model.min_seconds, Math.round(seconds)));
}

/** The file name a finished run lands under; also how a repeat import is recognised. */
export function generatedVideoFileName(runId: string): string {
	return `ai-video-${runId}.mp4`;
}

/** The server media id behind a cloud project image, which a start image must be. */
export function serverMediaId(
	media: Pick<MediaMetadata, 'storageType' | 'remoteUrl'>
): string | null {
	if (media.storageType !== 'cloud' || !media.remoteUrl) return null;
	const match = /\/media\/([0-9a-fA-F-]{36})(?:[/?#]|$)/.exec(media.remoteUrl);
	return match?.[1] ?? null;
}

/** Images a model can start from: still cloud images at least 300 px on each side. */
export function canStartFrom(media: MediaMetadata): boolean {
	return (
		/^image\/(png|jpeg|webp)$/.test(media.mimeType) &&
		media.width >= 300 &&
		media.height >= 300 &&
		serverMediaId(media) !== null
	);
}
