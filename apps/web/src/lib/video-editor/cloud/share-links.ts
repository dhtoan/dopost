/**
 * Read-only share links for Cloud Video Projects, after Donkey Cut's project
 * shares (site/src/cut/components/ShareDialog.tsx and
 * site/src/cut/lib/backend/shared.ts, commit cddf34f, Apache-2.0): one link
 * per project that anyone can open to watch it, and a viewer load that needs
 * no workspace.
 */
import { client } from '$lib/api/client';
import type { MediaMetadata } from '$lib/video-editor/media/types';
import type { Project } from '$lib/video-editor/project/types';
import { cloudMediaMetadata, documentFromAPI } from './project-repository';

export interface VideoProjectShare {
	token: string;
	createdAt: string;
}

export interface SharedVideoProject {
	name: string;
	document: Project;
	media: MediaMetadata[];
	/** When the signed media links stop working; reopening the link renews them. */
	expiresAt: string;
}

export class SharedProjectNotFoundError extends Error {
	constructor() {
		super('This share link does not exist or was turned off');
		this.name = 'SharedProjectNotFoundError';
	}
}

function toShare(
	share: { token: string; created_at: string } | null | undefined
): VideoProjectShare | null {
	return share ? { token: share.token, createdAt: share.created_at } : null;
}

/** The page a share link opens. */
export function shareLinkURL(token: string, origin = window.location.origin): string {
	return `${origin}/video-editor/shared/${encodeURIComponent(token)}`;
}

export async function getVideoProjectShare(
	workspaceId: string,
	projectId: string
): Promise<VideoProjectShare | null> {
	const { data, error } = await client.GET('/video-projects/{id}/share', {
		params: { path: { id: projectId }, query: { workspace_id: workspaceId } }
	});
	if (error) throw new Error('Could not read the share link');
	return toShare(data?.share);
}

export async function enableVideoProjectShare(
	workspaceId: string,
	projectId: string
): Promise<VideoProjectShare> {
	const { data, error } = await client.PUT('/video-projects/{id}/share', {
		params: { path: { id: projectId }, query: { workspace_id: workspaceId } }
	});
	const share = toShare(data?.share);
	if (error || !share) throw new Error('Could not turn on the share link');
	return share;
}

export async function disableVideoProjectShare(
	workspaceId: string,
	projectId: string
): Promise<void> {
	const { error } = await client.DELETE('/video-projects/{id}/share', {
		params: { path: { id: projectId }, query: { workspace_id: workspaceId } }
	});
	if (error) throw new Error('Could not turn off the share link');
}

/** Read a shared project by its token, with no session. */
export async function loadSharedVideoProject(token: string): Promise<SharedVideoProject> {
	const { data, error, response } = await client.GET('/public/video-shares/{token}', {
		params: { path: { token } }
	});
	if (response.status === 404) throw new SharedProjectNotFoundError();
	if (error || !data) throw new Error('Could not open the shared project');
	return {
		name: data.name,
		document: documentFromAPI<Project>(data.document),
		media: (data.assets ?? []).map((asset) =>
			cloudMediaMetadata(
				{ ...asset, preparation: asset.preparation ?? {} },
				{
					url: asset.url,
					mime_type: asset.mime_type,
					size: asset.size,
					duration_ms: asset.duration_ms,
					width: asset.width,
					height: asset.height,
					frame_rate: asset.frame_rate,
					video_codec: asset.video_codec,
					audio_codec: asset.audio_codec,
					container_format: asset.container_format
				}
			)
		),
		expiresAt: data.expires_at
	};
}
