/**
 * Import the media behind a page link (a TikTok, YouTube, Instagram or X post)
 * through the server's yt-dlp, after Donkey Cut's URL import
 * (site/src/cut/server/urlImport.ts, commit cddf34f, Apache-2.0). The server
 * returns the file; the editor then imports it like any file, with the page's
 * title and uploader kept as its attribution.
 */
import type { MediaAttribution } from './types';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** Stored with every link import: the editor cannot know the media's licence. */
export const LINK_IMPORT_LICENSE = 'Unverified: imported from a link';

export interface LinkMedia {
	file: File;
	attribution: MediaAttribution;
	title: string;
}

const availability = new Map<string, Promise<boolean>>();

/** Whether this server imports from page links. Asked once per workspace. */
export function linkImportAvailable(
	workspaceId: string,
	fetcher: Fetcher = fetch
): Promise<boolean> {
	if (!workspaceId) return Promise.resolve(false);
	let pending = availability.get(workspaceId);
	if (!pending) {
		pending = fetcher(`/api/v1/media/url-imports?workspace_id=${encodeURIComponent(workspaceId)}`, {
			credentials: 'include'
		})
			.then(async (response) => response.ok && Boolean((await response.json())?.enabled))
			.catch(() => false);
		availability.set(workspaceId, pending);
		// A failed check is asked again next time rather than remembered.
		void pending.then((enabled) => {
			if (!enabled) availability.delete(workspaceId);
		});
	}
	return pending;
}

const DIRECT_MEDIA_PATH =
	/\.(mp4|m4v|mov|webm|mkv|mp3|m4a|wav|ogg|opus|flac|aac|jpe?g|png|gif|webp|avif|svg|json|lottie)$/i;

/** True when the link names a media file rather than a page. */
export function looksLikeDirectMediaUrl(value: string): boolean {
	try {
		return DIRECT_MEDIA_PATH.test(new URL(value.trim()).pathname);
	} catch {
		return false;
	}
}

function header(response: Response, name: string): string {
	const raw = response.headers.get(name);
	if (!raw) return '';
	try {
		return decodeURIComponent(raw.replace(/\+/g, ' '));
	} catch {
		return raw;
	}
}

function fileNameFrom(response: Response, fallback: string): string {
	const disposition = response.headers.get('content-disposition') ?? '';
	const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1];
	if (encoded) {
		try {
			return decodeURIComponent(encoded.replace(/^"|"$/g, ''));
		} catch {
			/* use the plain name below */
		}
	}
	return /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)?.[1]?.trim() || fallback;
}

/** Download a page link's media through the server. */
export async function downloadLinkMedia(
	workspaceId: string,
	url: string,
	fetcher: Fetcher = fetch
): Promise<LinkMedia> {
	let response: Response;
	try {
		response = await fetcher('/api/v1/media/url-imports', {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ workspace_id: workspaceId, url: url.trim() })
		});
	} catch {
		throw new Error('The link could not be imported. Check your connection and try again.');
	}
	if (!response.ok) {
		let detail = '';
		try {
			detail = (await response.json())?.detail ?? '';
		} catch {
			/* no JSON body */
		}
		throw new Error(detail || `The link import failed with HTTP ${response.status}.`);
	}
	const blob = await response.blob();
	if (blob.size === 0) throw new Error('The link returned an empty file.');
	const type = response.headers.get('content-type')?.split(';')[0]?.trim() || blob.type;
	const file = new File([blob], fileNameFrom(response, 'Imported media'), {
		type,
		lastModified: Date.now()
	});
	const pageUrl = header(response, 'x-source-url') || url.trim();
	let provider = header(response, 'x-source-extractor');
	if (!provider || provider === 'Generic') {
		try {
			provider = new URL(pageUrl).hostname.replace(/^www\./, '');
		} catch {
			provider = 'Link';
		}
	}
	const attribution: MediaAttribution = {
		provider,
		// The page link names the source, and importing it again finds this media.
		sourceId: pageUrl,
		license: LINK_IMPORT_LICENSE
	};
	const uploader = header(response, 'x-source-uploader');
	if (uploader) attribution.author = uploader;
	return { file, title: header(response, 'x-source-title'), attribution };
}
