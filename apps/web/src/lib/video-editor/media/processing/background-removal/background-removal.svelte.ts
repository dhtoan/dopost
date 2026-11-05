// Adapted from Donkey Cut (site/src/cut/lib/removal/localBake.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: a media-pool job like
// upscale that writes a transparent VP9 WebM through mediabunny. See NOTICE.md.

/**
 * Remove the background from a video: every frame goes through the MediaPipe
 * selfie segmenter in the browser, the person matte becomes the frame's alpha,
 * and the result is a new transparent VP9 WebM in the project, which preview
 * and export already composite over whatever sits below it. The source media
 * is left as it was.
 */
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Output,
	WebMOutputFormat,
	canEncodeVideo,
	type VideoSample
} from 'mediabunny';
import { importGeneratedVideo } from '../../import.svelte';
import { resolveMediaBlob } from '../../resolve-media-blob';
import { mediaTaskId, mediaTasks } from '../../media-tasks.svelte';
import type { MediaMetadata, ProjectAssetImporter } from '../../types';
import {
	BACKGROUND_REMOVED_TAG,
	removedBackgroundFileName,
	segmentSize,
	writeMatte
} from './matte';

const MODEL_BASE = '/video-editor-models/mediapipe/';
/** Long sources would hold the whole result in memory; ten minutes keeps it bounded. */
export const BACKGROUND_REMOVAL_MAX_SECONDS = 10 * 60;
const OUTPUT_BITRATE = 8_000_000;

type Segmenter = import('@mediapipe/tasks-vision').ImageSegmenter;

let segmenterOnce: Promise<Segmenter> | null = null;

/** Load the person segmenter, GPU first and CPU when WebGL is unavailable. */
async function loadPersonSegmenter(): Promise<Segmenter> {
	const { ImageSegmenter } = await import('@mediapipe/tasks-vision');
	const fileset = {
		wasmLoaderPath: `${MODEL_BASE}vision_wasm_internal.js`,
		wasmBinaryPath: `${MODEL_BASE}vision_wasm_internal.wasm`
	};
	const options = (delegate: 'GPU' | 'CPU') => ({
		baseOptions: { modelAssetPath: `${MODEL_BASE}selfie_segmenter.tflite`, delegate },
		runningMode: 'IMAGE' as const,
		outputCategoryMask: false,
		outputConfidenceMasks: true
	});
	try {
		return await ImageSegmenter.createFromOptions(fileset, options('GPU'));
	} catch {
		return ImageSegmenter.createFromOptions(fileset, options('CPU'));
	}
}

/** The shared person segmenter. A failed load is not kept, so the next request tries again. */
function personSegmenter(): Promise<Segmenter> {
	if (!segmenterOnce) {
		const loading = loadPersonSegmenter();
		segmenterOnce = loading;
		loading.catch(() => {
			if (segmenterOnce === loading) segmenterOnce = null;
		});
	}
	return segmenterOnce;
}

function canvas2d(width: number, height: number) {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('This browser cannot draw video frames.');
	return { canvas, context };
}

/** Cut one frame out: the frame drawn whole, then kept only where the matte is. */
function createFrameCutter(segmenter: Segmenter, width: number, height: number) {
	const small = segmentSize(width, height);
	const scaled = canvas2d(small.width, small.height);
	const output = canvas2d(width, height);
	let matte: ReturnType<typeof canvas2d> | null = null;
	return (sample: VideoSample): OffscreenCanvas => {
		scaled.context.clearRect(0, 0, small.width, small.height);
		sample.draw(scaled.context, 0, 0, small.width, small.height);
		const result = segmenter.segment(scaled.canvas);
		output.context.globalCompositeOperation = 'source-over';
		output.context.clearRect(0, 0, width, height);
		try {
			// The person confidence is the last mask in every tasks-vision version.
			const masks = result.confidenceMasks;
			const mask = masks?.[masks.length - 1];
			if (!mask) return output.canvas;
			if (!matte || matte.canvas.width !== mask.width || matte.canvas.height !== mask.height) {
				matte = canvas2d(mask.width, mask.height);
			}
			const pixels = matte.context.createImageData(mask.width, mask.height);
			writeMatte(mask.getAsFloat32Array(), pixels.data);
			matte.context.putImageData(pixels, 0, 0);
		} finally {
			result.close();
		}
		sample.draw(output.context, 0, 0, width, height);
		output.context.globalCompositeOperation = 'destination-in';
		output.context.imageSmoothingEnabled = true;
		output.context.imageSmoothingQuality = 'high';
		output.context.drawImage(matte.canvas, 0, 0, width, height);
		output.context.globalCompositeOperation = 'source-over';
		return output.canvas;
	};
}

export interface BackgroundRemovalDependencies {
	resolveSource: (media: MediaMetadata) => Promise<Blob>;
	importVideo: (
		file: File,
		options: { projectId: string; tags?: string[] }
	) => Promise<MediaMetadata>;
}

const DEFAULT_DEPENDENCIES: BackgroundRemovalDependencies = {
	resolveSource: resolveMediaBlob,
	importVideo: importGeneratedVideo
};

function abortError(): DOMException {
	return new DOMException('Background removal was cancelled.', 'AbortError');
}

export class BackgroundRemovalService {
	private readonly running = new Map<string, () => void>();

	constructor(
		private readonly dependencies: BackgroundRemovalDependencies = DEFAULT_DEPENDENCIES
	) {}

	canRemoveBackground(media: MediaMetadata): boolean {
		return (
			media.mimeType.startsWith('video/') &&
			!media.tags.includes(BACKGROUND_REMOVED_TAG) &&
			media.duration > 0 &&
			media.duration <= BACKGROUND_REMOVAL_MAX_SECONDS
		);
	}

	isRunning(mediaId: string): boolean {
		return this.running.has(mediaId);
	}

	cancel(mediaId: string): void {
		this.running.get(mediaId)?.();
	}

	/** Bake the cut-out video and add it to the project as new media. */
	async generate(
		media: MediaMetadata,
		projectId: string,
		importAsset?: ProjectAssetImporter
	): Promise<MediaMetadata> {
		if (!this.canRemoveBackground(media)) {
			throw new Error('Background removal works on videos up to ten minutes long.');
		}
		if (this.running.has(media.id)) throw new Error('This video is already being processed.');
		const taskId = mediaTaskId('background-removal', media.id);
		let cancelled = false;
		let conversion: Conversion | null = null;
		const cancel = () => {
			cancelled = true;
			void conversion?.cancel();
		};
		this.running.set(media.id, cancel);
		const revision = mediaTasks.start({
			id: taskId,
			kind: 'background-removal',
			mediaId: media.id,
			label: media.fileName,
			stage: 'preparing',
			status: 'running',
			progress: null,
			onCancel: cancel
		});
		try {
			const [segmenter, source] = await Promise.all([
				personSegmenter(),
				this.dependencies.resolveSource(media)
			]);
			if (cancelled) throw abortError();
			const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
			const track = await input.getPrimaryVideoTrack();
			if (!track) throw new Error('This file has no video track.');
			const width = track.displayWidth;
			const height = track.displayHeight;
			if (
				!(await canEncodeVideo('vp9', { width, height, bitrate: OUTPUT_BITRATE, alpha: 'keep' }))
			) {
				throw new Error('This browser cannot encode transparent video (VP9 with alpha).');
			}
			const target = new BufferTarget();
			const output = new Output({ format: new WebMOutputFormat(), target });
			const cut = createFrameCutter(segmenter, width, height);
			conversion = await Conversion.init({
				input,
				output,
				video: {
					codec: 'vp9',
					alpha: 'keep',
					bitrate: OUTPUT_BITRATE,
					forceTranscode: true,
					process: (sample) => cut(sample),
					processedWidth: width,
					processedHeight: height
				},
				audio: { codec: 'opus' }
			});
			if (!conversion.isValid) {
				throw new Error('This video cannot be converted in the browser.');
			}
			conversion.onProgress = (progress) =>
				mediaTasks.update(taskId, { stage: 'rendering', progress }, revision);
			mediaTasks.update(taskId, { stage: 'rendering', progress: 0 }, revision);
			await conversion.execute();
			if (cancelled) throw abortError();
			const buffer = target.buffer;
			if (!buffer?.byteLength) throw new Error('Background removal produced no file.');
			const file = new File([buffer], removedBackgroundFileName(media.fileName), {
				type: 'video/webm'
			});
			const tags = ['video', BACKGROUND_REMOVED_TAG];
			const imported = importAsset
				? await importAsset(file, { projectId, tags })
				: await this.dependencies.importVideo(file, { projectId, tags });
			if (!imported) throw new Error('The cut-out video import was cancelled.');
			return imported;
		} catch (error) {
			if (cancelled) throw abortError();
			throw error instanceof Error ? error : new Error(String(error));
		} finally {
			this.running.delete(media.id);
			mediaTasks.finish(taskId, revision);
		}
	}
}

export const backgroundRemovalService = new BackgroundRemovalService();
