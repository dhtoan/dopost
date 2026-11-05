/**
 * Tagged HDR sources (HLG or PQ files whose tags say so).
 *
 * The browser decodes such a file straight to SDR when it draws a frame onto
 * a canvas, and its mapping is its own: Chrome on an SDR display puts HLG
 * reference white near 73% and clips PQ above about 1000 nits. That picture is
 * what every later stage of the editor sees, so a profile for the
 * original HLG or PQ signal cannot apply to it.
 *
 * Instead the browser's mapping is measured once per session, by drawing
 * frames of known 10-bit grey levels, and undone: each output value goes back
 * to the signal that made it, then forward through a BT.2408-style rendering,
 * which puts reference white (203 nits) at SDR white and rolls brighter
 * light off softly instead of clipping it. If a browser passes the signal
 * through unconverted, the measured curve is simply the signal itself and the
 * same correction still holds.
 */

import { hlgOetfInverse, hlgOotf, pqDecode, srgbEncode } from './color-space';

export type HdrTransfer = 'hlg' | 'pq';

/** BT.2408 HDR reference white, the level SDR white is put at. */
export const HDR_REFERENCE_WHITE_NITS = 203;
/** Below this share of SDR white the rendering is linear; above it, it rolls off. */
export const HDR_ROLLOFF_KNEE = 0.8;
/** Output steps in the correction table: one per 8-bit value the browser draws. */
const TABLE_SIZE = 256;
/** 10-bit grey levels drawn when measuring the browser. */
const LEVELS = 1024;
// SAFETY: I420P10 is a WebCodecs pixel format missing from TypeScript's DOM types; a
// browser without it throws in the VideoFrame constructor and no curve is measured.
const I420P10 = 'I420P10' as VideoPixelFormat;

/** A BT.2100 colour space. TypeScript's DOM types list only the SDR names; WebCodecs
 * accepts these, and a browser that does not throws where the frame is made. */
function bt2100ColorSpace(transfer: HdrTransfer): VideoColorSpaceInit {
	return {
		// SAFETY: bt2020, hlg/pq and bt2020-ncl are WebCodecs values TypeScript's DOM types omit.
		primaries: 'bt2020' as VideoColorPrimaries,
		// SAFETY: as above.
		transfer: transfer as VideoTransferCharacteristics,
		// SAFETY: as above.
		matrix: 'bt2020-ncl' as VideoMatrixCoefficients,
		fullRange: false
	};
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Display light of a grey HDR signal, in nits. HLG is shown on a 1000-nit display. */
export function hdrSignalNits(transfer: HdrTransfer, signal: number): number {
	const s = clamp01(signal);
	if (transfer === 'pq') return pqDecode(s);
	const e = hlgOetfInverse(s);
	return hlgOotf(e, e, e, 1000)[0];
}

/** Display light relative to SDR white → SDR linear: straight to the knee, then an
 * exponential shoulder with matching slope that approaches 1 without clipping. */
export function hdrRolloff(x: number): number {
	if (x <= HDR_ROLLOFF_KNEE) return Math.max(0, x);
	const span = 1 - HDR_ROLLOFF_KNEE;
	return HDR_ROLLOFF_KNEE + span * (1 - Math.exp(-(x - HDR_ROLLOFF_KNEE) / span));
}

/** The SDR value (sRGB-encoded, 0..1) a grey HDR signal should end up at. */
export function hdrSignalToSdr(transfer: HdrTransfer, signal: number): number {
	return srgbEncode(hdrRolloff(hdrSignalNits(transfer, signal) / HDR_REFERENCE_WHITE_NITS));
}

/**
 * The correction for one measured browser curve: `curve[i]` is what the
 * browser drew (0..1) for signal i / (curve.length - 1). The result maps each
 * of the 256 values the browser can draw to the value it should have been.
 */
export function taggedHdrCorrection(curve: ArrayLike<number>, transfer: HdrTransfer): Float32Array {
	const last = curve.length - 1;
	const table = new Float32Array(TABLE_SIZE);
	let i = 0;
	for (let o = 0; o < TABLE_SIZE; o++) {
		const target = o / (TABLE_SIZE - 1);
		while (i < last && curve[i]! < target) i++;
		let signal = i / last;
		if (i > 0 && curve[i]! >= target) {
			const below = curve[i - 1]!;
			const above = curve[i]!;
			const t = above > below ? (target - below) / (above - below) : 1;
			signal = (i - 1 + clamp01(t)) / last;
		}
		table[o] = hdrSignalToSdr(transfer, signal);
	}
	return table;
}

/** Look a value up in a correction table, interpolating between its steps. */
export function applyCorrection(table: Float32Array, value: number): number {
	const x = clamp01(value) * (table.length - 1);
	const lo = Math.floor(x);
	const hi = Math.min(table.length - 1, lo + 1);
	return table[lo]! + (table[hi]! - table[lo]!) * (x - lo);
}

/** Draw greys of every 10-bit HLG or PQ level through the browser's own decode-to-canvas
 * path and read back what it made of them. Null where VideoFrame or 2D canvases are missing. */
export function measureBrowserHdrCurve(transfer: HdrTransfer): Float32Array | null {
	if (typeof VideoFrame === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
	const width = LEVELS;
	const height = 2;
	const luma = new Uint16Array(width * height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) luma[y * width + x] = Math.round(64 + (x / (width - 1)) * 876);
	const chroma = new Uint16Array((width / 2) * (height / 2) * 2).fill(512);
	const planes = new Uint8Array(luma.byteLength + chroma.byteLength);
	planes.set(new Uint8Array(luma.buffer), 0);
	planes.set(new Uint8Array(chroma.buffer), luma.byteLength);
	let frame: VideoFrame | null = null;
	try {
		frame = new VideoFrame(planes, {
			format: I420P10,
			codedWidth: width,
			codedHeight: height,
			timestamp: 0,
			colorSpace: bt2100ColorSpace(transfer)
		});
		const canvas = new OffscreenCanvas(width, 1);
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return null;
		context.drawImage(frame, 0, 0, width, height, 0, 0, width, 1);
		const pixels = context.getImageData(0, 0, width, 1).data;
		const curve = new Float32Array(width);
		for (let x = 0; x < width; x++) curve[x] = pixels[x * 4 + 1]! / 255;
		// Keep it monotonic so 8-bit noise cannot fold the inverse back on itself.
		for (let x = 1; x < width; x++) curve[x] = Math.max(curve[x]!, curve[x - 1]!);
		return curve;
	} catch {
		return null;
	} finally {
		frame?.close();
	}
}

const corrections = new Map<HdrTransfer, Float32Array | null>();

/** This browser's correction for a tagged transfer, measured once per session. */
export function browserTaggedHdrCorrection(transfer: HdrTransfer): Float32Array | null {
	if (!corrections.has(transfer)) {
		const curve = measureBrowserHdrCurve(transfer);
		corrections.set(transfer, curve ? taggedHdrCorrection(curve, transfer) : null);
	}
	return corrections.get(transfer) ?? null;
}
