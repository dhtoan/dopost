/**
 * HDR media are marked with a tag at import, from the transfer the file's own
 * colour tags declare. Tags travel with media through local, cloud and bundle
 * storage, so the mark needs no new metadata field.
 */
import type { HdrTransfer } from '../effects/tagged-hdr';
import type { MediaMetadata } from './types';

export const HDR_MEDIA_TAGS = {
	hlg: 'hdr-hlg',
	pq: 'hdr-pq'
} as const satisfies Record<HdrTransfer, string>;

const HDR_TAG_SET = new Set<string>(Object.values(HDR_MEDIA_TAGS));

export function isHdrMediaTag(tag: string): boolean {
	return HDR_TAG_SET.has(tag);
}

/** The probe's transfer as media tags: none for SDR or unknown. */
export function hdrMediaTags(transfer: HdrTransfer | undefined): string[] {
	return transfer ? [HDR_MEDIA_TAGS[transfer]] : [];
}

/** A colour space's transfer, when it is one the editor treats as HDR. */
export function hdrTransferOf(transfer: string | null | undefined): HdrTransfer | undefined {
	return transfer === 'hlg' || transfer === 'pq' ? transfer : undefined;
}

/** The HDR transfer a media item was imported with, if any. */
export function mediaHdrTransfer(
	media: Pick<MediaMetadata, 'tags'> | undefined
): HdrTransfer | null {
	if (!media) return null;
	if (media.tags.includes(HDR_MEDIA_TAGS.hlg)) return 'hlg';
	if (media.tags.includes(HDR_MEDIA_TAGS.pq)) return 'pq';
	return null;
}
