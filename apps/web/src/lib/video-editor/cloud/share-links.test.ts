import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '$lib/api/client';
import {
	SharedProjectNotFoundError,
	enableVideoProjectShare,
	loadSharedVideoProject,
	shareLinkURL
} from './share-links';

describe('share links', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('opens the share page on the current origin', () => {
		expect(shareLinkURL('a-b_c', 'https://dopost.test')).toBe(
			'https://dopost.test/video-editor/shared/a-b_c'
		);
	});

	it('turns the shared document and signed assets into editor media', async () => {
		// SAFETY: The mocked GET response only needs the generated client's success shape.
		vi.spyOn(client, 'GET').mockResolvedValue({
			data: {
				name: 'Launch clip',
				updated_at: '2026-11-04T00:00:00Z',
				expires_at: '2026-11-04T12:00:00Z',
				document: { id: 'project-1', timeline: { tracks: [], items: [] } },
				assets: [
					{
						stable_media_id: 'clip-source',
						original_filename: 'clip.mp4',
						mime_type: 'video/mp4',
						size: 4000,
						preparation: { editorMedia: { duration: 4, hasAudio: true } },
						url: '/media/media-1?exp=1&sig=abc',
						width: 1080,
						height: 1920,
						duration_ms: 4000,
						frame_rate: 30,
						video_codec: 'h264',
						audio_codec: 'aac'
					}
				]
			},
			error: undefined,
			response: new Response(null, { status: 200 })
		} as never);

		const shared = await loadSharedVideoProject('token-1');

		expect(shared.name).toBe('Launch clip');
		expect(shared.document.id).toBe('project-1');
		expect(shared.media).toHaveLength(1);
		expect(shared.media[0]).toMatchObject({
			id: 'clip-source',
			storageType: 'cloud',
			remoteUrl: '/media/media-1?exp=1&sig=abc',
			offlineUrl: undefined,
			duration: 4,
			width: 1080,
			fps: 30,
			codec: 'h264'
		});
	});

	it('says when a link does not exist', async () => {
		// SAFETY: The mocked GET response only needs the generated client's error shape.
		vi.spyOn(client, 'GET').mockResolvedValue({
			data: undefined,
			error: { title: 'Not Found' },
			response: new Response(null, { status: 404 })
		} as never);
		await expect(loadSharedVideoProject('gone')).rejects.toBeInstanceOf(SharedProjectNotFoundError);
	});

	it('returns the link the server made', async () => {
		// SAFETY: The mocked PUT response only needs the generated client's success shape.
		const put = vi.spyOn(client, 'PUT').mockResolvedValue({
			data: { share: { token: 'token-2', created_at: '2026-11-04T00:00:00Z' } },
			error: undefined,
			response: new Response(null, { status: 200 })
		} as never);
		expect(await enableVideoProjectShare('workspace-1', 'project-1')).toEqual({
			token: 'token-2',
			createdAt: '2026-11-04T00:00:00Z'
		});
		expect(put.mock.calls[0]?.[1]).toMatchObject({
			params: { path: { id: 'project-1' }, query: { workspace_id: 'workspace-1' } }
		});
	});
});
