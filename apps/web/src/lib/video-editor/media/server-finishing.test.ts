import { describe, expect, it, vi } from 'vitest';
import { finishOnServer, type FinishingDependencies } from './server-finishing';
import type { RenderExportProgress } from './render-export';

const rendered = { fileName: 'Launch.mp4', blob: new Blob(['rendered']) };
const finishing = { target: 'prores-hq' as const, loudness: true, workspaceId: 'ws-1' };

function dependencies(
	statuses: { status: 'running' | 'done' | 'failed'; progress: number; error?: string }[],
	overrides: Partial<FinishingDependencies> = {}
) {
	const calls: { url: string; method: string }[] = [];
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, method: init?.method ?? 'GET' });
		if (url.endsWith('/file')) return new Response(new Blob(['finished-mov']));
		if (init?.method === 'DELETE') return new Response(null, { status: 204 });
		const next = statuses.shift()!;
		return new Response(JSON.stringify({ id: 'job-1', file_name: 'Launch.mov', ...next }));
	});
	const upload = vi.fn(
		async (
			_url: string,
			_blob: Blob,
			_signal: AbortSignal | undefined,
			onProgress: (n: number) => void
		) => {
			onProgress(0.5);
			onProgress(1);
			return { id: 'job-1', status: 'running' as const, progress: 0, file_name: 'Launch.mov' };
		}
	);
	return {
		calls,
		upload,
		deps: { fetch, upload, wait: async () => undefined, ...overrides } as FinishingDependencies
	};
}

describe('server finishing', () => {
	it('uploads, follows the job and brings back the finished file', async () => {
		const { calls, upload, deps } = dependencies([
			{ status: 'running', progress: 0.4 },
			{ status: 'done', progress: 1 }
		]);
		const phases: string[] = [];
		const result = await finishOnServer(
			rendered,
			finishing,
			{ onProgress: (p: RenderExportProgress) => phases.push(`${p.phase}:${p.progress}`) },
			deps
		);

		expect(await result.blob.text()).toBe('finished-mov');
		expect(result.fileName).toBe('Launch.mov');
		const query = new URL(upload.mock.calls[0]![0], 'https://dopost.test').searchParams;
		expect(Object.fromEntries(query)).toEqual({
			workspace_id: 'ws-1',
			target: 'prores-hq',
			name: 'Launch.mp4',
			loudness: '1'
		});
		expect(phases).toEqual([
			'uploading:0',
			'uploading:0.5',
			'uploading:1',
			'finishing:0',
			'finishing:0.4',
			'downloading:0',
			'downloading:1'
		]);
		expect(calls.map((call) => call.url)).toEqual([
			'/api/v1/export-finishing/job-1',
			'/api/v1/export-finishing/job-1',
			'/api/v1/export-finishing/job-1/file'
		]);
	});

	it('reports a failed job and removes it from the server', async () => {
		const { calls, deps } = dependencies([
			{ status: 'failed', progress: 0, error: 'ffmpeg failed: boom' }
		]);
		await expect(finishOnServer(rendered, finishing, {}, deps)).rejects.toThrow(
			'ffmpeg failed: boom'
		);
		expect(calls.at(-1)).toEqual({ url: '/api/v1/export-finishing/job-1', method: 'DELETE' });
	});

	it('cancels the server job when the export is cancelled', async () => {
		const controller = new AbortController();
		const { calls, deps } = dependencies([{ status: 'running', progress: 0.1 }], {
			wait: async () => controller.abort()
		});
		await expect(
			finishOnServer(rendered, finishing, { signal: controller.signal }, deps)
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(calls.at(-1)?.method).toBe('DELETE');
	});
});
