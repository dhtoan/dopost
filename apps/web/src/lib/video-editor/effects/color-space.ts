// Adapted from Donkey Cut (site/packages/effects-kit/src/colorSpace.ts, commit cddf34f),
// Copyright 2026 Donkey, Apache-2.0. Modified for dopost: kept the matrices, primaries,
// Apple Log and the BT.1886 / HLG / PQ transfers the source profiles use. See NOTICE.md.

/**
 * Color science primitives, each one a published standard: Apple Log, the
 * Rec.709 / Rec.2020 / P3 / Apple Wide Gamut / ACES primaries and their XYZ
 * matrices, BT.1886, BT.2100 HLG and PQ, and CAT02 and Bradford chromatic
 * adaptation. Nothing here is tuned by eye.
 *
 * Matrices are 9 numbers, row-major, applied to column vectors: out_i =
 * sum_j M[i*3+j] * v_j.
 */

/* ------------------------------------------------------------------ */
/* Matrices                                                            */
/* ------------------------------------------------------------------ */

export type Mat3 = number[];

export const MAT3_IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
	const out = new Array<number>(9);
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 3; j++)
			out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
	return out;
}

export function mat3Inv(m: Mat3): Mat3 {
	const [a, b, c, d, e, f, g, h, i] = m;
	const A = e * i - f * h;
	const B = -(d * i - f * g);
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	if (Math.abs(det) < 1e-18) throw new Error('singular matrix');
	const s = 1 / det;
	return [
		A * s,
		-(b * i - c * h) * s,
		(b * f - c * e) * s,
		B * s,
		(a * i - c * g) * s,
		-(a * f - c * d) * s,
		C * s,
		-(a * h - b * g) * s,
		(a * e - b * d) * s
	];
}

export function mat3Apply(m: Mat3, r: number, g: number, b: number): [number, number, number] {
	return [
		m[0] * r + m[1] * g + m[2] * b,
		m[3] * r + m[4] * g + m[5] * b,
		m[6] * r + m[7] * g + m[8] * b
	];
}

export function mat3Diag(x: number, y: number, z: number): Mat3 {
	return [x, 0, 0, 0, y, 0, 0, 0, z];
}

/* ------------------------------------------------------------------ */
/* Primaries                                                           */
/* ------------------------------------------------------------------ */

export interface Primaries {
	r: [number, number];
	g: [number, number];
	b: [number, number];
	w: [number, number];
}

export const D65: [number, number] = [0.3127, 0.329];
/** The ACES white point (~D60). */
export const ACES_WHITE: [number, number] = [0.32168, 0.33767];

export const REC709_PRIMARIES: Primaries = {
	r: [0.64, 0.33],
	g: [0.3, 0.6],
	b: [0.15, 0.06],
	w: D65
};
export const REC2020_PRIMARIES: Primaries = {
	r: [0.708, 0.292],
	g: [0.17, 0.797],
	b: [0.131, 0.046],
	w: D65
};
export const P3D65_PRIMARIES: Primaries = {
	r: [0.68, 0.32],
	g: [0.265, 0.69],
	b: [0.15, 0.06],
	w: D65
};
/** Apple Wide Gamut, the container of Apple Log 2 (Apple Log 2 white paper). */
export const APPLE_WIDE_GAMUT_PRIMARIES: Primaries = {
	r: [0.725, 0.301],
	g: [0.221, 0.814],
	b: [0.068, -0.076],
	w: D65
};
export const AP0_PRIMARIES: Primaries = {
	r: [0.7347, 0.2653],
	g: [0, 1],
	b: [0.0001, -0.077],
	w: ACES_WHITE
};
export const AP1_PRIMARIES: Primaries = {
	r: [0.713, 0.293],
	g: [0.165, 0.83],
	b: [0.128, 0.044],
	w: ACES_WHITE
};

export function xyToXYZ(x: number, y: number, Y = 1): [number, number, number] {
	return [(x * Y) / y, Y, ((1 - x - y) * Y) / y];
}

/** RGB → XYZ for a set of primaries, derived from their chromaticities so
 * the white maps to XYZ with Y = 1. */
export function rgbToXyzMatrix(p: Primaries): Mat3 {
	const P: Mat3 = [
		p.r[0],
		p.g[0],
		p.b[0],
		p.r[1],
		p.g[1],
		p.b[1],
		1 - p.r[0] - p.r[1],
		1 - p.g[0] - p.g[1],
		1 - p.b[0] - p.b[1]
	];
	const W = xyToXYZ(p.w[0], p.w[1]);
	const S = mat3Apply(mat3Inv(P), W[0], W[1], W[2]);
	return mat3Mul(P, mat3Diag(S[0], S[1], S[2]));
}

export function xyzToRgbMatrix(p: Primaries): Mat3 {
	return mat3Inv(rgbToXyzMatrix(p));
}

/* ------------------------------------------------------------------ */
/* Chromatic adaptation                                                */
/* ------------------------------------------------------------------ */

/** CAT02 cone response matrix (CIECAM02). */
export const CAT02: Mat3 = [
	0.7328, 0.4296, -0.1624, -0.7036, 1.6975, 0.0061, 0.003, 0.0136, 0.9834
];
/** Bradford cone response matrix, the ACES convention for gamut matrices. */
export const BRADFORD: Mat3 = [
	0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296
];

/** A von Kries adaptation in XYZ from one white to another through the given
 * cone response matrix. */
export function chromaticAdaptation(
	from: [number, number],
	to: [number, number],
	cone: Mat3 = CAT02
): Mat3 {
	const src = xyToXYZ(from[0], from[1]);
	const dst = xyToXYZ(to[0], to[1]);
	const s = mat3Apply(cone, src[0], src[1], src[2]);
	const d = mat3Apply(cone, dst[0], dst[1], dst[2]);
	return mat3Mul(mat3Inv(cone), mat3Mul(mat3Diag(d[0] / s[0], d[1] / s[1], d[2] / s[2]), cone));
}

/** RGB → RGB between two sets of primaries, adapting the white with the
 * given cone matrix when the whites differ. */
export function rgbToRgbMatrix(from: Primaries, to: Primaries, cone: Mat3 = BRADFORD): Mat3 {
	const sameWhite = from.w[0] === to.w[0] && from.w[1] === to.w[1];
	const cat = sameWhite ? MAT3_IDENTITY : chromaticAdaptation(from.w, to.w, cone);
	return mat3Mul(xyzToRgbMatrix(to), mat3Mul(cat, rgbToXyzMatrix(from)));
}

/* ------------------------------------------------------------------ */
/* Apple Log                                                           */
/* ------------------------------------------------------------------ */

const AL_R0 = -0.05641088;
const AL_RT = 0.01;
const AL_C = 47.28711236;
const AL_BETA = 0.00964052;
const AL_GAMMA = 0.08550479;
const AL_DELTA = 0.69336945;
const AL_PT = AL_C * (AL_RT - AL_R0) * (AL_RT - AL_R0);

/** Apple Log code value → scene-linear (18% grey at 0.18). Constants from the
 * Apple Log white paper, as carried in OCIO and ACES. */
export function appleLogDecode(p: number): number {
	if (p >= AL_PT) return Math.pow(2, (p - AL_DELTA) / AL_GAMMA) - AL_BETA;
	if (p >= 0) return Math.sqrt(p / AL_C) + AL_R0;
	return AL_R0;
}

/** Scene-linear → Apple Log code value. */
export function appleLogEncode(r: number): number {
	if (r >= AL_RT) return AL_GAMMA * Math.log2(r + AL_BETA) + AL_DELTA;
	if (r >= AL_R0) return AL_C * (r - AL_R0) * (r - AL_R0);
	return 0;
}

/* ------------------------------------------------------------------ */
/* Transfer functions                                                  */
/* ------------------------------------------------------------------ */

/** Signed power: negative inputs mirror, so an out-of-range intermediate
 * value stays continuous through an encode and the final clamp decides. */
export function spow(x: number, e: number): number {
	return x < 0 ? -Math.pow(-x, e) : Math.pow(x, e);
}

/** BT.1886 EOTF, L = a·(V + b)^2.4 with Lw = 1, Lb = 0. */
export function bt1886Decode(v: number): number {
	return spow(v, 2.4);
}

export function bt1886Encode(l: number): number {
	return spow(l, 1 / 2.4);
}

const HLG_A = 0.17883277;
const HLG_B = 0.28466892;
const HLG_C = 0.55991073;

/** BT.2100 HLG OETF: scene-linear (0..1) → signal. */
export function hlgOetf(e: number): number {
	if (e <= 0) return 0;
	return e <= 1 / 12 ? Math.sqrt(3 * e) : HLG_A * Math.log(12 * e - HLG_B) + HLG_C;
}

/** BT.2100 HLG inverse OETF: signal → scene-linear. */
export function hlgOetfInverse(s: number): number {
	if (s <= 0) return 0;
	return s <= 0.5 ? (s * s) / 3 : (Math.exp((s - HLG_C) / HLG_A) + HLG_B) / 12;
}

/** HLG system gamma for a display of the given peak (1.2 at 1000 nits):
 * BT.2100's formula across its 400–2000 nit range, BT.2390's extended one
 * outside it (0.846 on a 100-nit SDR display). */
export function hlgGamma(peakNits = 1000): number {
	if (peakNits >= 400 && peakNits <= 2000) return 1.2 + 0.42 * Math.log10(peakNits / 1000);
	return 1.2 * Math.pow(1.111, Math.log2(peakNits / 1000));
}

/** sRGB transfer: display-linear → signal. */
export function srgbEncode(l: number): number {
	return l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

const REC2020_LUMA = [0.2627, 0.678, 0.0593];

/** BT.2100 HLG OOTF: scene-linear RGB → display light in nits. */
export function hlgOotf(
	r: number,
	g: number,
	b: number,
	peakNits = 1000
): [number, number, number] {
	const ys = REC2020_LUMA[0] * r + REC2020_LUMA[1] * g + REC2020_LUMA[2] * b;
	const k = ys > 0 ? peakNits * Math.pow(ys, hlgGamma(peakNits) - 1) : 0;
	return [k * r, k * g, k * b];
}

/** BT.2100 HLG inverse OOTF: display light in nits → scene-linear RGB. */
export function hlgOotfInverse(
	r: number,
	g: number,
	b: number,
	peakNits = 1000
): [number, number, number] {
	const yd = REC2020_LUMA[0] * r + REC2020_LUMA[1] * g + REC2020_LUMA[2] * b;
	if (yd <= 0) return [0, 0, 0];
	const gamma = hlgGamma(peakNits);
	const k = Math.pow(yd / peakNits, (1 - gamma) / gamma) / peakNits;
	return [k * r, k * g, k * b];
}

const PQ_M1 = 0.1593017578125;
const PQ_M2 = 78.84375;
const PQ_C1 = 0.8359375;
const PQ_C2 = 18.8515625;
const PQ_C3 = 18.6875;

/** SMPTE ST 2084 EOTF: signal → nits. */
export function pqDecode(n: number): number {
	if (n <= 0) return 0;
	const np = Math.pow(n, 1 / PQ_M2);
	const l = Math.max(0, np - PQ_C1) / (PQ_C2 - PQ_C3 * np);
	return Math.pow(l, 1 / PQ_M1) * 10000;
}

/** SMPTE ST 2084 inverse EOTF: nits → signal. */
export function pqEncode(nits: number): number {
	if (nits <= 0) return 0;
	const lm = Math.pow(nits / 10000, PQ_M1);
	return Math.pow((PQ_C1 + PQ_C2 * lm) / (1 + PQ_C3 * lm), PQ_M2);
}
