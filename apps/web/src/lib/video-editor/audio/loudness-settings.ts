// Adapted from Donkey Cut (site/src/cut/lib/loudnessSettings.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost. See NOTICE.md.

/** A loudness choice for an export: off, or one of the named targets. */
export type ExportLoudness = 'off' | 'social' | 'podcast' | 'broadcast';

/** The LUFS each named target masters to. */
export const EXPORT_LOUDNESS_TARGETS = {
	social: -14,
	podcast: -16,
	broadcast: -23
} as const satisfies Record<Exclude<ExportLoudness, 'off'>, number>;

/** The true-peak ceiling a mastered mix is held under, dBTP. */
export const EXPORT_TRUE_PEAK_CEILING = -1;

export const EXPORT_LOUDNESS_IDS: readonly ExportLoudness[] = [
	'off',
	'social',
	'podcast',
	'broadcast'
];

export function isExportLoudness(value: unknown): value is ExportLoudness {
	return EXPORT_LOUDNESS_IDS.some((id) => id === value);
}

/** The mastering target for a choice, or null when the mix is left as mixed. */
export function exportLoudnessTarget(
	choice: ExportLoudness | undefined
): { targetLufs: number; ceilingDbtp: number } | null {
	if (!choice || choice === 'off') return null;
	return { targetLufs: EXPORT_LOUDNESS_TARGETS[choice], ceilingDbtp: EXPORT_TRUE_PEAK_CEILING };
}
