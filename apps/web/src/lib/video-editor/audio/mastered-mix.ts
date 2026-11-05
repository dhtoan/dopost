import { exportLoudnessTarget, type ExportLoudness } from './loudness-settings';
import { LoudnessMeter, masterPlan, TruePeakLimiter } from './loudness';

/** One planar window of the export mix. */
export interface MixWindow {
	samples: Float32Array[];
}

/**
 * The export mix, mastered to the chosen loudness. With no target the mix
 * passes through untouched. With a target the mix is rendered twice: the
 * first pass only measures it (BS.1770 integrated loudness and true peak),
 * the second applies one gain and, when that gain would carry the true peak
 * over the ceiling, the limiter. Memory stays bounded by one window either way.
 */
export async function* masteredMixWindows(
	windows: () => AsyncIterable<MixWindow>,
	loudness: ExportLoudness | undefined,
	sampleRate: number,
	channels: number
): AsyncGenerator<MixWindow> {
	const target = exportLoudnessTarget(loudness);
	if (!target) {
		yield* windows();
		return;
	}
	const meter = new LoudnessMeter(sampleRate, channels);
	for await (const win of windows()) meter.push(win.samples);
	const plan = masterPlan(meter.result(), target.targetLufs, target.ceilingDbtp);
	const gain = 10 ** (plan.gainDb / 20);
	const limiter = plan.limit ? new TruePeakLimiter(sampleRate, channels, target.ceilingDbtp) : null;
	for await (const win of windows()) {
		const gained = win.samples.map((channel) => {
			const out = new Float32Array(channel.length);
			for (let i = 0; i < channel.length; i++) out[i] = channel[i]! * gain;
			return out;
		});
		const out = limiter ? limiter.process(gained) : gained;
		if (out[0] && out[0].length > 0) yield { samples: out };
	}
	if (limiter) {
		const rest = limiter.flush();
		if (rest[0] && rest[0].length > 0) yield { samples: rest };
	}
}
