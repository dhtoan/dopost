import { browser } from '$app/environment';
import { clampMonitorVolume, normalizePreviewZoom } from './playback-settings';
import { sanitizeGuides, type GuideId } from './guides';

const STORAGE_KEY = 'openpost-video-editor-playback';

interface StoredPlaybackSettings {
	volume?: number;
	muted?: boolean;
	audioSkimmingEnabled?: boolean;
	previewQuality?: 'auto' | 'full';
	guides?: GuideId[];
}

function readStored(): StoredPlaybackSettings {
	if (!browser) return {};
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		if (!parsed || typeof parsed !== 'object') return {};
		return {
			volume: 'volume' in parsed && typeof parsed.volume === 'number' ? parsed.volume : undefined,
			muted: 'muted' in parsed && typeof parsed.muted === 'boolean' ? parsed.muted : undefined,
			previewQuality:
				'previewQuality' in parsed &&
				(parsed.previewQuality === 'auto' || parsed.previewQuality === 'full')
					? parsed.previewQuality
					: undefined,
			audioSkimmingEnabled:
				'audioSkimmingEnabled' in parsed && typeof parsed.audioSkimmingEnabled === 'boolean'
					? parsed.audioSkimmingEnabled
					: undefined,
			guides: 'guides' in parsed ? sanitizeGuides(parsed.guides) : undefined
		};
	} catch {
		return {};
	}
}

const stored = readStored();
const state = $state({
	zoom: -1,
	volume: clampMonitorVolume(stored.volume ?? 1),
	muted: stored.muted ?? false,
	audioSkimmingEnabled: stored.audioSkimmingEnabled ?? true,
	previewQuality: stored.previewQuality ?? 'auto',
	guides: stored.guides ?? ([] as GuideId[])
});

function persist(): void {
	if (!browser) return;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			volume: state.volume,
			muted: state.muted,
			audioSkimmingEnabled: state.audioSkimmingEnabled,
			previewQuality: state.previewQuality,
			guides: state.guides
		})
	);
}

export const previewPlaybackSettings = {
	get zoom(): number {
		return state.zoom;
	},
	get volume(): number {
		return state.volume;
	},
	get muted(): boolean {
		return state.muted;
	},
	get audioSkimmingEnabled(): boolean {
		return state.audioSkimmingEnabled;
	},
	get previewQuality(): 'auto' | 'full' {
		return state.previewQuality;
	},
	/** Editor-only overlay guides; never part of exports or captured frames. */
	get guides(): readonly GuideId[] {
		return state.guides;
	},
	setGuide(id: GuideId, on: boolean): void {
		state.guides = sanitizeGuides(
			on ? [...state.guides, id] : state.guides.filter((guide) => guide !== id)
		);
		persist();
	},
	setZoom(value: number): void {
		state.zoom = normalizePreviewZoom(value);
	},
	resetZoom(): void {
		state.zoom = -1;
	},
	setVolume(value: number): void {
		state.volume = clampMonitorVolume(value);
		if (state.volume > 0) state.muted = false;
		persist();
	},
	toggleMute(): void {
		state.muted = !state.muted;
		persist();
	},
	setMuted(muted: boolean): void {
		state.muted = muted;
		persist();
	},
	toggleAudioSkimming(): void {
		state.audioSkimmingEnabled = !state.audioSkimmingEnabled;
		persist();
	},
	setPreviewQuality(value: 'auto' | 'full'): void {
		state.previewQuality = value;
		persist();
	}
};
