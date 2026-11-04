/** Source color profile: decodes log or untagged HDR code values to Rec.709 before the grade. */
import {
	SOURCE_PROFILES,
	SOURCE_PROFILE_EFFECT_ID,
	SOURCE_PROFILE_LUT_SIZE,
	buildSourceProfileLut,
	isSourceProfile
} from '../source-profile';
import type { GpuProgramDefinition } from './types';

export const sourceProfile: GpuProgramDefinition = {
	id: SOURCE_PROFILE_EFFECT_ID,
	label: 'Source profile',
	category: 'color',
	entryPoint: 'sourceProfileFragment',
	fragmentSource: `
uniform highp sampler3D uDataTex;
uniform float u_lutSize;
vec4 sourceProfileFragment(vec2 vUv) {
  vec4 source = texture(uInputTex, vUv);
  if (textureSize(uDataTex, 0).x < 2) return source;
  float size = max(2.0, u_lutSize);
  vec3 coords = (clamp(source.rgb, vec3(0.0), vec3(1.0)) * (size - 1.0) + 0.5) / size;
  return vec4(texture(uDataTex, coords).rgb, source.a);
}`,
	schema: [
		{
			type: 'select',
			name: 'profile',
			label: 'Profile',
			animatable: false,
			default: 'rec709',
			options: SOURCE_PROFILES
		}
	],
	uniformValues: () => ({ u_lutSize: SOURCE_PROFILE_LUT_SIZE }),
	dataTexture: {
		dimension: '3d',
		key: (params) => [String(params.profile ?? 'rec709')],
		build: (params) => {
			const data = isSourceProfile(params.profile) ? buildSourceProfileLut(params.profile) : null;
			if (data) {
				const size = SOURCE_PROFILE_LUT_SIZE;
				return { width: size, height: size, depth: size, data };
			}
			// Rec.709 needs no conversion: the one-texel marker bypasses the lookup.
			return { width: 1, height: 1, depth: 1, data: new Uint8Array(4) };
		}
	}
};
