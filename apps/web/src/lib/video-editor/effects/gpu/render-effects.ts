/**
 * The GPU effects a clip renders with, in order, shared by the direct preview
 * and the stacked compositor that export also uses.
 *
 * A clip from tagged HDR media renders through the matching "tagged file"
 * source profile unless it has a source-profile effect of its own: choosing
 * any profile, Rec.709 included, or disabling the effect, takes over.
 */
import type { ItemEffect } from '../types';
import type { HdrTransfer } from '../tagged-hdr';
import { SOURCE_PROFILE_EFFECT_ID, type SourceProfile } from '../source-profile';
import type { GpuRenderEffect } from './compositor';
import { getGpuEffectDefaultParams } from './registry';

export function taggedHdrProfile(transfer: HdrTransfer): SourceProfile {
	return transfer === 'hlg' ? 'hlg-tagged' : 'pq-tagged';
}

/** Whether a clip's own effects already decide its source profile. */
export function hasOwnSourceProfile(effects: readonly ItemEffect[] | undefined): boolean {
	return (effects ?? []).some(
		(effect) => effect.type === 'gpu' && effect.effectId === SOURCE_PROFILE_EFFECT_ID
	);
}

export function gpuRenderEffects(
	effects: readonly ItemEffect[] | undefined,
	hdrTransfer: HdrTransfer | null = null
): GpuRenderEffect[] {
	const rendered = (effects ?? []).flatMap((effect) =>
		effect.type === 'gpu' && effect.enabled
			? [
					{
						effectId: effect.effectId,
						params: {
							...getGpuEffectDefaultParams(effect.effectId),
							...effect.params
						}
					}
				]
			: []
	);
	if (!hdrTransfer || hasOwnSourceProfile(effects)) return rendered;
	return [
		{ effectId: SOURCE_PROFILE_EFFECT_ID, params: { profile: taggedHdrProfile(hdrTransfer) } },
		...rendered
	];
}
