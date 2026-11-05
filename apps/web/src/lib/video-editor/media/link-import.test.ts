import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	LINK_IMPORT_LICENSE,
	downloadLinkMedia,
	linkImportAvailable,
	looksLikeDirectMediaUrl
} from './link-import';
import { importMediaFromUrl } from './import-url';
import type { MediaMetadata, ProjectAssetImporter } from './types';

function serverFile(headers: Record<string, string> = {}): Response {
	return new Response(new Blob(['video-bytes']), {
		headers: {
			'content-type': 'video/mp4',
			'content-disposition': 'attachment; filename="Lamp setup.mp4"',
			'x-source-title': 'Lamp+setup',
			'x-source-uploader': 'Studio+One',
			'x-source-url': encodeURIComponent('https://www.youtube.com/watch?v=abc'),
			'x-source-extractor': 'Youtube',
			'x-source-id': 'abc',
			...headers
		}
	});
}

function cloudMedia(file: File): MediaMetadata {
	return {
		id: 'cloud-media-1',
		storageType: 'cloud',
		remoteUrl: '/media/cloud-media-1',
		fileName: file.name,
		fileSize: file.size,
		mimeType: file.type,
		duration: 1,
		width: 1,
		height: 1,
		fps: 30,
		codec: 'h264',
		bitrate: 0,
		tags: ['video']
	};
}

describe('link import', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('tells file links from page links', () => {
		expect(looksLikeDirectMediaUrl('https://cdn.example/clip.MP4?x=1')).toBe(true);
		expect(looksLikeDirectMediaUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
		expect(looksLikeDirectMediaUrl('not a url')).toBe(false);
	});

	it('keeps the page details as the attribution', async () => {
		const fetcher = vi.fn(async () => serverFile());
		const media = await downloadLinkMedia('ws-1', ' https://youtu.be/abc ', fetcher);

		expect(fetcher).toHaveBeenCalledWith(
			'/api/v1/media/url-imports',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ workspace_id: 'ws-1', url: 'https://youtu.be/abc' })
			})
		);
		expect(media.file.name).toBe('Lamp setup.mp4');
		expect(media.file.type).toBe('video/mp4');
		expect(media.title).toBe('Lamp setup');
		expect(media.attribution).toEqual({
			provider: 'Youtube',
			author: 'Studio One',
			sourceId: 'https://www.youtube.com/watch?v=abc',
			license: LINK_IMPORT_LICENSE
		});
	});

	it('names a generic page by its host and shows the server reason on failure', async () => {
		const generic = await downloadLinkMedia('ws-1', 'https://videos.example.org/post/1', async () =>
			serverFile({ 'x-source-extractor': 'Generic', 'x-source-url': '' })
		);
		expect(generic.attribution.provider).toBe('videos.example.org');

		await expect(
			downloadLinkMedia(
				'ws-1',
				'https://example.org',
				async () =>
					new Response(JSON.stringify({ detail: 'Enter a public http(s) link.' }), { status: 400 })
			)
		).rejects.toThrow('Enter a public http(s) link.');
	});

	it('asks the server once per workspace whether it imports page links', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ enabled: true })));
		expect(await linkImportAvailable('ws-cached', fetcher)).toBe(true);
		expect(await linkImportAvailable('ws-cached', fetcher)).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(await linkImportAvailable('', fetcher)).toBe(false);
	});

	it('sends page links to the server and file links to the browser', async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				calls.push(String(input));
				return String(input).startsWith('/api/') ? serverFile() : serverFile({});
			})
		);
		const importAsset = vi.fn<ProjectAssetImporter>(async (file) => cloudMedia(file));

		await importMediaFromUrl('https://www.youtube.com/watch?v=abc', {
			projectId: 'p1',
			storageMode: 'copy',
			importAsset,
			linkImportWorkspaceId: 'ws-1'
		});
		expect(calls).toEqual(['/api/v1/media/url-imports']);
		expect(importAsset.mock.calls[0]?.[1]).toMatchObject({
			attribution: { provider: 'Youtube', license: LINK_IMPORT_LICENSE }
		});

		calls.length = 0;
		await importMediaFromUrl('https://cdn.example/clip.mp4', {
			projectId: 'p1',
			storageMode: 'copy',
			importAsset,
			linkImportWorkspaceId: 'ws-1'
		});
		expect(calls).toEqual(['https://cdn.example/clip.mp4']);
	});
});
