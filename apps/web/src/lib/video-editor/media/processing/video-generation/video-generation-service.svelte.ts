/**
 * Starts video generations, follows them while the editor is open, and brings
 * each finished clip into the project it was made for, once. Runs live on the
 * server, so reopening the project picks up where it left off.
 */
import { z } from 'zod';
import type { components } from '@openpost/api-contract';
import { client } from '$lib/api/client';
import { importGeneratedVideo } from '../../import.svelte';
import { mediaPool } from '../../pool.svelte';
import { mediaTaskId, mediaTasks } from '../../media-tasks.svelte';
import type { MediaMetadata, ProjectAssetImporter } from '../../types';
import {
	generatedVideoFileName,
	isTerminalRun,
	type VideoGenerationConfig,
	type VideoGenerationRequest,
	type VideoGenerationRun
} from './video-generation';

const POLL_MS = 5_000;
export const VIDEO_GENERATION_TAG = 'ai-generated';
const IMPORTED_KEY = 'dopost:video-generation-imported:';
const IMPORTED_MAX = 200;
const IMPORTED_IDS = z.array(z.string());

/** Runs already brought into a project, so a clip the user later deletes is not
 * imported again on the next visit. Browser storage may be unavailable. */
function importedRuns(projectId: string): Set<string> {
	try {
		const stored = IMPORTED_IDS.safeParse(
			JSON.parse(localStorage.getItem(IMPORTED_KEY + projectId) ?? '[]')
		);
		return new Set(stored.success ? stored.data : []);
	} catch {
		return new Set();
	}
}

function rememberImported(projectId: string, runId: string): void {
	try {
		const ids = [...importedRuns(projectId), runId].slice(-IMPORTED_MAX);
		localStorage.setItem(IMPORTED_KEY + projectId, JSON.stringify(ids));
	} catch {
		// Without storage the file-name check still prevents duplicates in Media.
	}
}

export interface VideoGenerationApi {
	config(): Promise<VideoGenerationConfig>;
	create(request: VideoGenerationRequest, key: string): Promise<VideoGenerationRun>;
	get(id: string): Promise<VideoGenerationRun>;
	list(workspaceId: string, projectId: string): Promise<VideoGenerationRun[]>;
	download(mediaId: string): Promise<Blob>;
}

type ApiErrorBody = components['schemas']['ErrorModel'];

function apiError(error: ApiErrorBody | undefined, fallback: string): Error {
	return new Error(error?.detail || fallback);
}

export const serverVideoGenerationApi: VideoGenerationApi = {
	async config() {
		const { data, error } = await client.GET('/video-generations/config');
		if (error || !data) throw apiError(error, 'Video generation is unavailable.');
		return data;
	},
	async create(request, key) {
		const { data, error } = await client.POST('/video-generations', {
			params: { header: { 'Idempotency-Key': key } },
			body: request
		});
		if (error || !data) throw apiError(error, 'The video could not be started.');
		return data;
	},
	async get(id) {
		const { data, error } = await client.GET('/video-generations/{id}', {
			params: { path: { id } }
		});
		if (error || !data) throw apiError(error, 'The video generation could not be read.');
		return data;
	},
	async list(workspaceId, projectId) {
		const { data, error } = await client.GET('/video-generations', {
			params: { query: { workspace_id: workspaceId, project_id: projectId } }
		});
		if (error || !data) throw apiError(error, 'Video generations could not be read.');
		return data.runs ?? [];
	},
	async download(mediaId) {
		const response = await fetch(`/media/${encodeURIComponent(mediaId)}`, {
			credentials: 'include'
		});
		if (!response.ok) throw new Error('The generated video could not be downloaded.');
		return response.blob();
	}
};

export interface ImportTarget {
	projectId: string;
	importAsset?: ProjectAssetImporter;
}

/** How a finished clip enters the project; the editor's generated-video import by default. */
export type ImportVideo = typeof importGeneratedVideo;

export class VideoGenerationService {
	runs = $state<VideoGenerationRun[]>([]);
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly importing = new Set<string>();
	private target: ImportTarget | null = null;
	private workspaceId = '';
	private scope = '';

	constructor(
		private readonly api: VideoGenerationApi = serverVideoGenerationApi,
		private readonly importVideo: ImportVideo = importGeneratedVideo
	) {}

	config(): Promise<VideoGenerationConfig> {
		return this.api.config();
	}

	/** Load this project's runs and resume following unfinished ones. */
	async open(workspaceId: string, target: ImportTarget): Promise<void> {
		const scope = `${workspaceId}:${target.projectId}`;
		if (scope !== this.scope) this.close();
		this.scope = scope;
		this.target = target;
		this.workspaceId = workspaceId;
		const runs = await this.api.list(workspaceId, target.projectId);
		if (this.scope !== scope) return;
		this.runs = runs;
		for (const run of runs) this.follow(run);
	}

	/** Read the project's runs again, for runs started elsewhere such as another tab. */
	async refresh(): Promise<void> {
		if (this.target) await this.open(this.workspaceId, this.target);
	}

	/** Stop polling, for a project switch or unmount. */
	close(): void {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.runs = [];
		this.target = null;
		this.workspaceId = '';
		this.scope = '';
	}

	async start(request: VideoGenerationRequest): Promise<VideoGenerationRun> {
		const run = await this.api.create(request, crypto.randomUUID());
		this.upsert(run);
		this.follow(run);
		return run;
	}

	private upsert(run: VideoGenerationRun): void {
		this.runs = [run, ...this.runs.filter((entry) => entry.id !== run.id)];
	}

	private alreadyImported(run: VideoGenerationRun): MediaMetadata | undefined {
		const name = generatedVideoFileName(run.id);
		return mediaPool.mediaList.find((media) => media.fileName === name);
	}

	private follow(run: VideoGenerationRun): void {
		const taskId = mediaTaskId('video-generation', run.id);
		if (run.state === 'completed') {
			if (mediaTasks.get(taskId)) mediaTasks.finish(taskId);
			void this.importResult(run);
			return;
		}
		if (isTerminalRun(run)) {
			if (mediaTasks.get(taskId)) mediaTasks.finish(taskId);
			return;
		}
		if (!mediaTasks.get(taskId)) {
			mediaTasks.start({
				id: taskId,
				kind: 'video-generation',
				mediaId: run.id,
				label: run.prompt,
				stage: run.state === 'queued' ? 'preparing' : 'rendering',
				status: 'running',
				progress: null
			});
		}
		if (this.timers.has(run.id)) return;
		const scope = this.scope;
		this.timers.set(
			run.id,
			setTimeout(async () => {
				this.timers.delete(run.id);
				if (this.scope !== scope) return;
				let next = run;
				try {
					next = await this.api.get(run.id);
				} catch {
					// A dropped poll tries again next time; the run lives on the server.
				}
				if (this.scope !== scope) return;
				this.upsert(next);
				this.follow(next);
			}, POLL_MS)
		);
	}

	/** Bring a finished clip into the project once, however many times it is seen. */
	private async importResult(run: VideoGenerationRun): Promise<void> {
		const target = this.target;
		if (!target || !run.result_media_id || this.importing.has(run.id)) return;
		if (importedRuns(target.projectId).has(run.id) || this.alreadyImported(run)) return;
		this.importing.add(run.id);
		try {
			const blob = await this.api.download(run.result_media_id);
			if (this.target !== target || this.alreadyImported(run)) return;
			const file = new File([blob], generatedVideoFileName(run.id), { type: 'video/mp4' });
			await this.importVideo(file, {
				projectId: target.projectId,
				tags: ['video', VIDEO_GENERATION_TAG],
				importAsset: target.importAsset
			});
			rememberImported(target.projectId, run.id);
		} finally {
			this.importing.delete(run.id);
		}
	}
}

export const videoGenerationService = new VideoGenerationService();
