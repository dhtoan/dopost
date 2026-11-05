// Adapted from Donkey Cut (site/packages/effects-kit/src/gradeMatch.ts and
// colorDifference.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: the fit moves dopost's
// Color Wheels sliders, rendered by a CPU copy of the Color Wheels shader, and
// starts from the clip's current grade. See NOTICE.md.

/**
 * Shot matching: measure a reference frame, then fit the clip's Color Wheels
 * (exposure, contrast, shadows, highlights, temperature, tint and saturation) so the
 * clip's own frame reads like it. Every try renders the clip's ungraded pixels
 * through the wheels with the candidate settings and compares the two pictures in
 * CIELAB: the lightness distribution, and the cast and spread of the shadows,
 * midtones and highlights.
 */

/** Quantile probes used by stats and matching. */
export const STAT_QUANTILES = [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98] as const;

export interface ToneColor {
	share: number;
	a: number;
	b: number;
	spreadA: number;
	spreadB: number;
}

export interface ColorStats {
	/** CIELAB lightness L* (0..100) at each STAT_QUANTILES probe. */
	lightness: number[];
	/** The shadows, midtones and highlights (TONE_BANDS): share of pixels, mean a* and
	 * b* cast and their spread. */
	tones: ToneColor[];
}

/** Upper L* edge of each tonal band, darkest first. */
const TONE_BANDS = [35, 70, 100];

/** Lightness bins per L* unit: a tenth of the smallest step anyone sees. */
const L_BINS_PER_UNIT = 10;

const XN = 0.95047;
const ZN = 1.08883;
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);

/** Display values 0..255 (Rec.709 primaries, BT.1886) to CIELAB under D65. */
export function displayToLab(r: number, g: number, b: number): [number, number, number] {
	const lr = (r / 255) ** 2.4;
	const lg = (g / 255) ** 2.4;
	const lb = (b / 255) ** 2.4;
	const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / XN;
	const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
	const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / ZN;
	const fy = labF(y);
	return [116 * fy - 16, 500 * (labF(x) - fy), 200 * (fy - labF(z))];
}

/** Stats of an RGBA frame. Transparent pixels are skipped; undefined when none are left. */
export function colorStatsFromPixels(data: Uint8ClampedArray): ColorStats | undefined {
	const lightHist = new Float64Array(100 * L_BINS_PER_UNIT + 1);
	// Per band: count, Σa, Σb, Σa², Σb².
	const bands = TONE_BANDS.map(() => [0, 0, 0, 0, 0]);
	let count = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		const [L, a, b] = displayToLab(data[i]!, data[i + 1]!, data[i + 2]!);
		lightHist[Math.max(0, Math.min(lightHist.length - 1, Math.round(L * L_BINS_PER_UNIT)))]++;
		const band =
			bands[
				Math.max(
					0,
					TONE_BANDS.findIndex((top) => L <= top)
				)
			]!;
		band[0]++;
		band[1] += a;
		band[2] += b;
		band[3] += a * a;
		band[4] += b * b;
		count++;
	}
	if (!count) return undefined;
	const lightness = STAT_QUANTILES.map((p) => {
		let acc = 0;
		for (let v = 0; v < lightHist.length; v++) {
			acc += lightHist[v]!;
			if (acc >= count * p) return v / L_BINS_PER_UNIT;
		}
		return (lightHist.length - 1) / L_BINS_PER_UNIT;
	});
	return {
		lightness,
		tones: bands.map(([n, sa, sb, saa, sbb]) => {
			if (!n) return { share: 0, a: 0, b: 0, spreadA: 0, spreadB: 0 };
			const a = sa! / n;
			const b = sb! / n;
			return {
				share: n / count,
				a,
				b,
				spreadA: Math.sqrt(Math.max(0, saa! / n - a * a)),
				spreadB: Math.sqrt(Math.max(0, sbb! / n - b * b))
			};
		})
	};
}

/** The most pixels a fit renders per try: enough for quantiles a tenth of an L* apart,
 * few enough that a few hundred tries take well under a second. */
export const FIT_SAMPLE = 4096;

/** An evenly spread subset of an RGBA frame's pixels, at most `limit` of them. */
export function samplePixels(data: Uint8ClampedArray, limit = FIT_SAMPLE): Uint8ClampedArray {
	const pixels = Math.floor(data.length / 4);
	if (pixels <= limit) return data.slice();
	const out = new Uint8ClampedArray(limit * 4);
	const step = pixels / limit;
	for (let i = 0; i < limit; i++) {
		const from = Math.floor(i * step) * 4;
		out[i * 4] = data[from]!;
		out[i * 4 + 1] = data[from + 1]!;
		out[i * 4 + 2] = data[from + 2]!;
		out[i * 4 + 3] = data[from + 3]!;
	}
	return out;
}

export type WheelParams = Record<string, number>;

const WHEEL_DEFAULTS: WheelParams = {
	shadowsHue: 0,
	shadowsAmount: 0,
	midtonesHue: 0,
	midtonesAmount: 0,
	highlightsHue: 0,
	highlightsAmount: 0,
	offsetHue: 0,
	offsetAmount: 0,
	temperature: 0,
	tint: 0,
	saturation: 0,
	exposure: 0,
	contrast: 1,
	pivot: 0.5,
	lift: 0,
	gamma: 1,
	gain: 1,
	offset: 0,
	blackPoint: 0,
	whitePoint: 1,
	midDetail: 0,
	colorBoost: 0,
	shadows: 0,
	highlights: 0,
	hue: 50,
	lumMix: 100
};

const luma601 = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const smoothstep = (e0: number, e1: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const k = (n: number) => (n + h * 6) % 6;
	const f = (n: number) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
	return [f(5), f(3), f(1)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
		if (h < 0) h += 1;
	}
	return [h, max === 0 ? 0 : d / max, max];
}

/**
 * Renders RGBA pixels through Color Wheels in place: a CPU copy of the
 * `gpu-color-wheels` fragment shader, step for step, so a fit sees what the preview
 * and the export draw.
 */
export function renderColorWheels(pixels: Uint8ClampedArray, settings: WheelParams): void {
	const p = { ...WHEEL_DEFAULTS, ...settings };
	const tints = (['shadows', 'midtones', 'highlights', 'offset'] as const).flatMap((band) => {
		const amount = p[`${band}Amount`]!;
		if (amount < 0.001) return [];
		return [{ band, amount, color: hsvToRgb(p[`${band}Hue`]! / 360, 1, 1) }];
	});
	const temp = p.temperature! / 100;
	const tint = p.tint! / 100;
	const exposure = 2 ** p.exposure!;
	const exponent = 1 / Math.max(p.gamma!, 0.05);
	const range = Math.max(p.whitePoint! - p.blackPoint!, 0.001);
	const sat = 1 + p.saturation! / 100;
	const boost = p.colorBoost! / 100;
	const hueShift = (p.hue! - 50) / 100;
	const lumMix = Math.max(0, Math.min(1, p.lumMix! / 100));
	const channel = new Array<number>(3);
	for (let i = 0; i < pixels.length; i += 4) {
		let r = pixels[i]! / 255;
		let g = pixels[i + 1]! / 255;
		let b = pixels[i + 2]! / 255;
		const luma = luma601(r, g, b);
		const shadowMask = 1 - smoothstep(0, 0.5, luma);
		const highlightMask = smoothstep(0.5, 1, luma);
		const midMask = 1 - shadowMask - highlightMask;
		for (const entry of tints) {
			const mask =
				entry.band === 'shadows'
					? shadowMask
					: entry.band === 'midtones'
						? midMask
						: entry.band === 'highlights'
							? highlightMask
							: 1;
			const mix = (c: number, t: number) => c + (c * (1 + (t - 1) * entry.amount) - c) * mask;
			r = mix(r, entry.color[0]);
			g = mix(g, entry.color[1]);
			b = mix(b, entry.color[2]);
		}
		r += temp * 0.1 + tint * 0.05;
		g -= tint * 0.1;
		b += -temp * 0.1 + tint * 0.05;
		channel[0] = r;
		channel[1] = g;
		channel[2] = b;
		for (let c = 0; c < 3; c++) {
			channel[c] = (channel[c]! * exposure - p.pivot!) * p.contrast! + p.pivot!;
		}
		if (Math.abs(p.midDetail!) > 0.001) {
			const detailLuma = luma601(channel[0]!, channel[1]!, channel[2]!);
			for (let c = 0; c < 3; c++) {
				const adjusted = detailLuma + (channel[c]! - detailLuma) * (1 + p.midDetail! / 100);
				channel[c] = channel[c]! + (adjusted - channel[c]!) * midMask;
			}
		}
		for (let c = 0; c < 3; c++) {
			let v = (channel[c]! + p.lift! + p.offset!) * p.gain!;
			v = Math.max(v, 0) ** exponent;
			v = (v - p.blackPoint!) / range;
			channel[c] = v + (p.shadows! / 100) * shadowMask + (p.highlights! / 100) * highlightMask;
		}
		const gray = luma601(channel[0]!, channel[1]!, channel[2]!);
		for (let c = 0; c < 3; c++) channel[c] = gray + (channel[c]! - gray) * sat;
		if (Math.abs(boost) > 0.001) {
			const boostedGray = luma601(channel[0]!, channel[1]!, channel[2]!);
			const chroma = [0, 1, 2].map((c) => channel[c]! - boostedGray);
			const length = Math.hypot(chroma[0]!, chroma[1]!, chroma[2]!);
			const scale = 1 + boost * (1 - Math.max(0, Math.min(1, length)));
			for (let c = 0; c < 3; c++) channel[c] = boostedGray + chroma[c]! * scale;
		}
		if (Math.abs(hueShift) > 0.001) {
			const [h, s, v] = rgbToHsv(channel[0]!, channel[1]!, channel[2]!);
			const shifted = hsvToRgb((((h + hueShift) % 1) + 1) % 1, s, v);
			channel[0] = shifted[0];
			channel[1] = shifted[1];
			channel[2] = shifted[2];
		}
		const postLuma = luma601(channel[0]!, channel[1]!, channel[2]!);
		for (let c = 0; c < 3; c++) {
			const v = postLuma + (channel[c]! - postLuma) * lumMix;
			pixels[i + c] = Math.round(Math.max(0, Math.min(1, v)) * 255);
		}
	}
}

/**
 * The sliders a match moves, each as a step on a shared ±50 scale (Donkey's grade
 * range) mapped onto the wheel parameter, so one damping and one pull to zero work
 * for all of them. Every one is a control the user reads afterwards.
 */
const MATCH_FIELDS = [
	{ key: 'exposure', perStep: 2 / 50, min: -3, max: 3 },
	{ key: 'contrast', perStep: 0.6 / 50, min: 0, max: 2 },
	{ key: 'highlights', perStep: 1, min: -100, max: 100 },
	{ key: 'shadows', perStep: 1, min: -100, max: 100 },
	{ key: 'temperature', perStep: 1, min: -100, max: 100 },
	{ key: 'tint', perStep: 1, min: -100, max: 100 },
	{ key: 'saturation', perStep: 1, min: -100, max: 100 }
] as const;

const STEP_MAX = 50;

/** Cost of a slider's distance from where it started, in squared ΔL* units at full
 * throw: when two settings fit equally, the smaller change wins. */
const MATCH_PULL = 4;

/** Step of the finite differences the fit takes its slopes from. */
const MATCH_PROBE = 2;

/** The fit stops once no slider would move by more than this many steps. */
const MATCH_SETTLED = 0.25;
const MATCH_ITERATIONS = 40;

/** Longest stretch the fit works before it hands the thread back, so a match never
 * holds a preview frame. */
const FIT_SLICE_MS = 8;

function nextTask(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}

/** How far apart two frames read, as residuals in CIELAB units: the lightness
 * distribution probe by probe, and each tonal band's cast and spread weighted by the
 * share of the reference it holds. */
function statsResiduals(a: ColorStats, b: ColorStats): number[] {
	const out = a.lightness.map((l, i) => l - b.lightness[i]!);
	for (let i = 0; i < b.tones.length; i++) {
		const p = a.tones[i]!;
		const q = b.tones[i]!;
		const w = Math.sqrt(TONE_BANDS.length * q.share);
		out.push(
			w * (p.a - q.a),
			w * (p.b - q.b),
			w * (p.spreadA - q.spreadA),
			w * (p.spreadB - q.spreadB)
		);
	}
	return out;
}

/** Solves A x = y for a small dense system by Gaussian elimination with partial
 * pivoting; null when A is singular. */
function solve(A: number[][], y: number[]): number[] | null {
	const n = y.length;
	const m = A.map((row, i) => [...row, y[i]!]);
	for (let c = 0; c < n; c++) {
		let pivot = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[pivot]![c]!)) pivot = r;
		if (Math.abs(m[pivot]![c]!) < 1e-12) return null;
		[m[c], m[pivot]] = [m[pivot]!, m[c]!];
		for (let r = c + 1; r < n; r++) {
			const f = m[r]![c]! / m[c]![c]!;
			for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--) {
		let v = m[r]![n]!;
		for (let k = r + 1; k < n; k++) v -= m[r]![k]! * x[k]!;
		x[r] = v / m[r]![r]!;
	}
	return x;
}

function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/**
 * The Color Wheels settings that bring `source` (the clip's ungraded pixels) to
 * `reference`, starting from the clip's `current` wheel settings: Levenberg–Marquardt
 * least squares over MATCH_FIELDS with a light pull back towards where each slider
 * started. `strength` (0..1) scales the change, for a reference whose content differs
 * from the clip's. Returns only the sliders that changed; empty when the frames
 * already agree.
 */
export async function matchColorWheels(options: {
	source: Uint8ClampedArray;
	reference: ColorStats;
	current: WheelParams;
	strength?: number;
}): Promise<WheelParams> {
	const k = Math.max(0, Math.min(1, options.strength ?? 1));
	if (k === 0) return {};
	const source = samplePixels(options.source);
	const base = { ...WHEEL_DEFAULTS, ...options.current };
	const work = new Uint8ClampedArray(source.length);
	// Each slider can step only as far as its parameter's range allows.
	const limits = MATCH_FIELDS.map((field) => ({
		low: Math.max(-STEP_MAX, (field.min - base[field.key]!) / field.perStep),
		high: Math.min(STEP_MAX, (field.max - base[field.key]!) / field.perStep)
	}));
	const settingsOf = (steps: number[]): WheelParams => {
		const next = { ...base };
		MATCH_FIELDS.forEach((field, i) => {
			next[field.key] = base[field.key]! + steps[i]! * field.perStep;
		});
		return next;
	};
	const pull = Math.sqrt(MATCH_PULL) / STEP_MAX;
	let sliceStart = performance.now();
	const residuals = async (steps: number[]): Promise<number[] | null> => {
		if (performance.now() - sliceStart > FIT_SLICE_MS) {
			await nextTask();
			sliceStart = performance.now();
		}
		work.set(source);
		renderColorWheels(work, settingsOf(steps));
		const stats = colorStatsFromPixels(work);
		return stats
			? [...statsResiduals(stats, options.reference), ...steps.map((v) => pull * v)]
			: null;
	};
	const sumSq = (r: number[]) => r.reduce((a, v) => a + v * v, 0);
	const clampStep = (v: number, i: number) =>
		Math.max(limits[i]!.low, Math.min(limits[i]!.high, v));

	// Levenberg–Marquardt: slopes by finite differences, a damped Gauss–Newton step,
	// damping eased after a step that helps and raised after one that does not.
	let p = MATCH_FIELDS.map(() => 0);
	let r = await residuals(p);
	if (!r) return {};
	let damping = 1e-2;
	for (let it = 0; it < MATCH_ITERATIONS; it++) {
		const J: number[][] = [];
		for (let j = 0; j < p.length; j++) {
			const q = [...p];
			q[j] = p[j]! + MATCH_PROBE <= limits[j]!.high ? p[j]! + MATCH_PROBE : p[j]! - MATCH_PROBE;
			const rq = (await residuals(q)) ?? r;
			J.push(rq.map((x, i) => (x - r![i]!) / (q[j]! - p[j]!)));
		}
		const A = J.map((ci) => J.map((cj) => ci.reduce((a, x, i) => a + x * cj[i]!, 0)));
		const g = J.map((ci) => ci.reduce((a, x, i) => a + x * r![i]!, 0));
		let stepped = false;
		let largest = 0;
		while (damping < 1e6) {
			const damped = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + damping) + 1e-9 : v)));
			const delta = solve(
				damped,
				g.map((v) => -v)
			);
			if (!delta) break;
			const next = p.map((v, i) => clampStep(v + delta[i]!, i));
			largest = Math.max(...next.map((v, i) => Math.abs(v - p[i]!)));
			const rn = await residuals(next);
			if (rn && sumSq(rn) < sumSq(r)) {
				p = next;
				r = rn;
				damping = Math.max(1e-6, damping / 3);
				stepped = true;
				break;
			}
			damping *= 4;
		}
		if (!stepped || largest < MATCH_SETTLED) break;
	}

	const changed: WheelParams = {};
	MATCH_FIELDS.forEach((field, i) => {
		const steps = Math.round(p[i]! * k);
		if (steps) changed[field.key] = round4(base[field.key]! + steps * field.perStep);
	});
	return changed;
}
