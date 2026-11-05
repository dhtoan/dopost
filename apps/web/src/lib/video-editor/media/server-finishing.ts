/**
 * Server finishing: the browser renders the export as usual, at a high
 * bitrate, and the server re-encodes it with ffmpeg into a format browsers
 * cannot encode (ProRes 422 HQ, H.265, constant-quality H.264), optionally
 * normalising loudness. After Donkey Cut's server export
 * (site/src/cut/server/exportPipeline.ts, commit cddf34f, Apache-2.0); the
 * picture is rendered by the same compositor as the preview, so it matches.
 */
import type { RenderExportProgress } from './render-export';

export type FinishingTargetId = 'prores-hq' | 'hevc' | 'h264-small';

export interface ServerFinishing {
	target: FinishingTargetId;
	/** -14 LUFS integrated, -1 dBTP. */
	loudness: boolean;
	workspaceId: string;
}

export interface FinishingCapabilities {
	enabled: boolean;
	targets: FinishingTargetId[];
}

/** The intermediate the browser renders for the server: high enough that the second encode costs little. */
export const FINISHING_INTERMEDIATE_BITRATE = 50_000_000;

const BASE = '/api/v1/export-finishing';
const POLL_MS = 1000;

let capabilities: Promise<FinishingCapabilities> | null = null;

/** Whether this server finishes exports, asked once per page load. */
export function serverFinishingCapabilities(
	fetcher: typeof fetch = fetch
): Promise<FinishingCapabilities> {
	capabilities ??= fetcher(BASE, { credentials: 'include' })
		.then(async (response) => {
			if (!response.ok) return { enabled: false, targets: [] };
			const body = (await response.json()) as { enabled?: boolean; targets?: { id: string }[] };
			return {
				enabled: Boolean(body.enabled),
				targets: (body.targets ?? []).map((target) => target.id as FinishingTargetId)
			};
		})
		.catch(() => ({ enabled: false, targets: [] }));
	return capabilities;
}

export function resetServerFinishingCapabilities(): void {
	capabilities = null;
}

interface FinishingJob {
	id: string;
	status: 'running' | 'done' | 'failed' | 'cancelled';
	progress: number;
	error?: string;
	file_name: string;
}

export interface FinishingDependencies {
	fetch: typeof fetch;
	upload: (
		url: string,
		blob: Blob,
		signal: AbortSignal | undefined,
		onProgress: (share: number) => void
	) => Promise<FinishingJob>;
	wait: (ms: number) => Promise<void>;
}

function abortError(): DOMException {
	return new DOMException('The export was cancelled.', 'AbortError');
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string };
		return body.error || fallback;
	} catch {
		return fallback;
	}
}

/** Upload with XMLHttpRequest, the one browser API that reports upload progress. */
function xhrUpload(
	url: string,
	blob: Blob,
	signal: AbortSignal | undefined,
	onProgress: (share: number) => void
): Promise<FinishingJob> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open('POST', url);
		request.withCredentials = true;
		request.setRequestHeader('Content-Type', 'application/octet-stream');
		request.upload.onprogress = (event) => {
			if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
		};
		request.onload = () => {
			let body: { error?: string } & Partial<FinishingJob> = {};
			try {
				body = JSON.parse(request.responseText);
			} catch {
				/* not JSON */
			}
			if (request.status === 202 && body.id) resolve(body as FinishingJob);
			else reject(new Error(body.error || `Server finishing failed with HTTP ${request.status}.`));
		};
		request.onerror = () => reject(new Error('The export could not be uploaded for finishing.'));
		request.onabort = () => reject(abortError());
		signal?.addEventListener('abort', () => request.abort(), { once: true });
		request.send(blob);
	});
}

const defaultDependencies: FinishingDependencies = {
	fetch: (...args) => fetch(...args),
	upload: xhrUpload,
	wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

/**
 * Send a rendered export to the server and bring back the finished file.
 * Progress runs through 'uploading', 'finishing' and 'downloading'.
 */
export async function finishOnServer(
	rendered: { fileName: string; blob: Blob },
	finishing: ServerFinishing,
	options: {
		signal?: AbortSignal;
		onProgress?: (progress: RenderExportProgress) => void;
	} = {},
	dependencies: FinishingDependencies = defaultDependencies
): Promise<{ fileName: string; blob: Blob }> {
	const report = (phase: RenderExportProgress['phase'], progress: number) =>
		options.onProgress?.({ phase, progress, framesDone: 0, totalFrames: 0 });
	const query = new URLSearchParams({
		workspace_id: finishing.workspaceId,
		target: finishing.target,
		name: rendered.fileName,
		loudness: finishing.loudness ? '1' : '0'
	});
	report('uploading', 0);
	const job = await dependencies.upload(
		`${BASE}?${query}`,
		rendered.blob,
		options.signal,
		(share) => report('uploading', share)
	);
	const cancel = () =>
		void dependencies
			.fetch(`${BASE}/${job.id}`, { method: 'DELETE', credentials: 'include' })
			.catch(() => undefined);
	try {
		let current = job;
		while (current.status === 'running') {
			report('finishing', current.progress);
			await dependencies.wait(POLL_MS);
			if (options.signal?.aborted) throw abortError();
			const response = await dependencies.fetch(`${BASE}/${job.id}`, { credentials: 'include' });
			if (!response.ok) {
				throw new Error(await errorMessage(response, 'The finishing job was lost.'));
			}
			current = (await response.json()) as FinishingJob;
		}
		if (current.status !== 'done') {
			throw new Error(current.error || 'The server could not finish this export.');
		}
		report('downloading', 0);
		const response = await dependencies.fetch(`${BASE}/${job.id}/file`, {
			credentials: 'include',
			signal: options.signal
		});
		if (!response.ok) {
			throw new Error(await errorMessage(response, 'The finished file could not be downloaded.'));
		}
		const blob = await response.blob();
		report('downloading', 1);
		return { fileName: current.file_name, blob };
	} catch (error) {
		cancel();
		throw error;
	}
}
