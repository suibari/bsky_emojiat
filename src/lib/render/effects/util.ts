/** エフェクト共通の小道具。 */
import { TAU, clamp01, type Box, type Ctx2D, type Frame, type Surface } from './types';

export const frac = (x: number) => x - Math.floor(x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** x が a〜b のどこにあるか（0〜1） */
export const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const smooth = (x: number) => {
	const e = clamp01(x);
	return e * e * (3 - 2 * e);
};
export const easeInOut = (x: number) => {
	const e = clamp01(x);
	return e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
};

/** 2つの整数から決まる 0〜1 の値。粒や破片の配置を毎コマ同じにするのに使う。 */
export function hash(a: number, b = 0) {
	let h = Math.imul(0x9e3779b9 ^ (a | 0), 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35);
	h ^= h >>> 15;
	h = Math.imul(h, 0x2545f491);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** なめらかな値ノイズ。y 方向は period ごとに繰り返すので、時間を y に入れるとループがつながる。 */
export function vnoise(x: number, y: number, period: number, seed: number) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const fx = smooth(x - xi);
	const fy = smooth(y - yi);
	const at = (i: number, j: number) => hash(i * 131 + seed, (((j % period) + period) % period) * 17 + seed);
	const a = at(xi, yi);
	const b = at(xi + 1, yi);
	const c = at(xi, yi + 1);
	const d = at(xi + 1, yi + 1);
	const top = a + (b - a) * fx;
	return top + (c + (d - c) * fx - top) * fy;
}

export type RGB = [number, number, number];
export const mix = (a: RGB, b: RGB, k: number): RGB => {
	const t = clamp01(k);
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
};
export const css = (c: RGB, alpha = 1) =>
	`rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;
export const hexRgb = (hex: string): RGB => {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
export const luma = (r: number, g: number, b: number) => (299 * r + 587 * g + 114 * b) / 1000;

/** 色の段階（at は 0〜1）を 256 段の表にする。 */
export function gradientLut(stops: { at: number; color: string }[]) {
	const s = stops.map((x) => ({ at: x.at, rgb: hexRgb(x.color) }));
	const lut = new Uint8ClampedArray(256 * 3);
	let j = 0;
	for (let i = 0; i < 256; i++) {
		const t = i / 255;
		while (j < s.length - 2 && t > s[j + 1].at) j++;
		const a = s[j];
		const b = s[Math.min(j + 1, s.length - 1)];
		const k = b.at - a.at <= 0 ? 0 : clamp01((t - a.at) / (b.at - a.at));
		for (let c = 0; c < 3; c++) lut[i * 3 + c] = a.rgb[c] + (b.rgb[c] - a.rgb[c]) * k;
	}
	return lut;
}

export type Placement = {
	tx?: number;
	ty?: number;
	sx?: number;
	sy?: number;
	rot?: number;
	alpha?: number;
	/** 変形の中心。枠の幅・高さに対する割合（既定は真ん中） */
	ox?: number;
	oy?: number;
};

/** src を変形して描く。中心は ox, oy（割合）。 */
export function drawT(ctx: Ctx2D, src: Surface, f: Frame, o: Placement = {}) {
	drawAt(ctx, src, (o.ox ?? 0.5) * f.w, (o.oy ?? 0.5) * f.h, o);
}

/** src を変形して描く。中心はピクセルで指定する。 */
export function drawAt(ctx: Ctx2D, src: Surface, cx: number, cy: number, o: Placement = {}) {
	ctx.save();
	if (o.alpha !== undefined) ctx.globalAlpha *= clamp01(o.alpha);
	ctx.translate(cx + (o.tx ?? 0), cy + (o.ty ?? 0));
	if (o.rot) ctx.rotate(o.rot);
	ctx.scale(o.sx ?? 1, o.sy ?? 1);
	ctx.translate(-cx, -cy);
	ctx.drawImage(src, 0, 0);
	ctx.restore();
}

type Scratch = { canvas: Surface; ctx: Ctx2D };
const pool = new Map<string, Scratch>();

/** 名前ごとに使い回す作業用キャンバス。ピクセルを読む用途なので willReadFrequently を付ける。 */
export function scratch(key: string, w: number, h: number): Scratch {
	w = Math.max(1, Math.round(w));
	h = Math.max(1, Math.round(h));
	let s = pool.get(key);
	if (!s || s.canvas.width !== w || s.canvas.height !== h) {
		const canvas: Surface =
			typeof OffscreenCanvas !== 'undefined'
				? new OffscreenCanvas(w, h)
				: Object.assign(document.createElement('canvas'), { width: w, height: h });
		const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D;
		s = { canvas, ctx };
		pool.set(key, s);
	} else {
		s.ctx.setTransform(1, 0, 0, 1, 0, 0);
		s.ctx.globalAlpha = 1;
		s.ctx.globalCompositeOperation = 'source-over';
		s.ctx.clearRect(0, 0, w, h);
	}
	return s;
}

/** src を w×h に縮めて RGBA を読む。 */
export function readPixels(key: string, src: Surface, w: number, h: number) {
	const s = scratch(key, w, h);
	s.ctx.drawImage(src, 0, 0, s.canvas.width, s.canvas.height);
	return s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height);
}

/** 不透明な部分を囲む箱（ピクセル）。何もなければ null。 */
export function alphaBox(src: Surface, f: Frame): Box | null {
	const gh = Math.min(64, f.h);
	const gw = Math.max(1, Math.round((gh * f.w) / f.h));
	const { data } = readPixels('alpha-box', src, gw, gh);
	let x0 = gw;
	let y0 = gh;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < gh; y++)
		for (let x = 0; x < gw; x++) {
			if (data[(y * gw + x) * 4 + 3] < 128) continue;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	if (x1 < 0) return null;
	const kx = f.w / gw;
	const ky = f.h / gh;
	return { x0: x0 * kx, y0: y0 * ky, x1: (x1 + 1) * kx, y1: (y1 + 1) * ky };
}

/** 縮小した alpha（0〜1）。炎や闇の「場」を作る元にする。 */
export function alphaGrid(key: string, src: Surface, gw: number, gh: number) {
	const { data } = readPixels(key, src, gw, gh);
	const a = new Float32Array(gw * gh);
	for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3] / 255;
	return a;
}

/** グリッドを双線形に引く。 */
export function sampleGrid(g: Float32Array, gw: number, gh: number, x: number, y: number) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const fx = x - xi;
	const fy = y - yi;
	const at = (i: number, j: number) => (i < 0 || j < 0 || i >= gw || j >= gh ? 0 : g[j * gw + i]);
	const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
	return top + (at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx - top) * fy;
}

/** 字の内側で、ふちからの距離（ピクセル）。外側は 0。 */
export function insideDistance(data: Uint8ClampedArray, w: number, h: number) {
	const d = new Float32Array(w * h);
	for (let i = 0; i < d.length; i++) d[i] = data[i * 4 + 3] >= 128 ? 1e6 : 0;
	const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
	const D = Math.SQRT2;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (d[i] === 0) continue;
			d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
		}
	for (let y = h - 1; y >= 0; y--)
		for (let x = w - 1; x >= 0; x--) {
			const i = y * w + x;
			if (d[i] === 0) continue;
			d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
		}
	return d;
}

/** 重いピクセル処理は高さ 256px までに抑えて行い、元の大きさへ引き伸ばす。 */
export function workSize(f: Frame) {
	const k = Math.min(1, 256 / f.h);
	return { w: Math.max(1, Math.round(f.w * k)), h: Math.max(1, Math.round(f.h * k)), k };
}

/** src の各ピクセルを書き換えて dst に描く。fn は不透明なピクセルにだけ呼ばれる。 */
export function mapPixels(
	dst: Ctx2D,
	src: Surface,
	f: Frame,
	key: string,
	fn: (d: Uint8ClampedArray, i: number, x: number, y: number, w: number, h: number) => void
) {
	const ws = workSize(f);
	const img = readPixels(key, src, ws.w, ws.h);
	const d = img.data;
	for (let y = 0; y < ws.h; y++)
		for (let x = 0; x < ws.w; x++) {
			const i = (y * ws.w + x) * 4;
			if (d[i + 3] === 0) continue;
			fn(d, i, x, y, ws.w, ws.h);
		}
	const s = scratch(key, ws.w, ws.h);
	s.ctx.putImageData(img, 0, 0);
	dst.drawImage(s.canvas, 0, 0, f.w, f.h);
}

/** 単色で塗ったシルエット。 */
export function silhouette(key: string, src: Surface, f: Frame, color: string) {
	const s = scratch(key, f.w, f.h);
	s.ctx.drawImage(src, 0, 0);
	s.ctx.globalCompositeOperation = 'source-in';
	s.ctx.fillStyle = color;
	s.ctx.fillRect(0, 0, f.w, f.h);
	s.ctx.globalCompositeOperation = 'source-over';
	return s.canvas;
}

/** src を縮めて置き直す（上に炎や闇の余白を作る）。ay は縦の寄せ（0=上, 1=下）。 */
export function shrink(key: string, src: Surface, f: Frame, k: number, ay: number) {
	if (k >= 1) return src;
	const s = scratch(key, f.w, f.h);
	s.ctx.drawImage(src, (f.w * (1 - k)) / 2, f.h * (1 - k) * ay, f.w * k, f.h * k);
	return s.canvas;
}

/** 字のふち（外側に接する不透明ピクセル）を step おきに集める。 */
export function edgePoints(data: Uint8ClampedArray, w: number, h: number, step = 2) {
	const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
	const out: { x: number; y: number }[] = [];
	for (let y = 0; y < h; y += step)
		for (let x = 0; x < w; x += step)
			if (a(x, y) >= 128 && (a(x - 1, y) < 128 || a(x + 1, y) < 128 || a(x, y - 1) < 128 || a(x, y + 1) < 128))
				out.push({ x, y });
	return out;
}

/** ふちの点での外向きの向き。 */
export function outward(data: Uint8ClampedArray, w: number, h: number, p: { x: number; y: number }, r: number) {
	let sx = 0;
	let sy = 0;
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * TAU;
		const x = Math.round(p.x + Math.cos(a) * r);
		const y = Math.round(p.y + Math.sin(a) * r);
		const v = x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3];
		if (v < 128) {
			sx += Math.cos(a);
			sy += Math.sin(a);
		}
	}
	const n = Math.hypot(sx, sy);
	return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: -1 };
}

/** ギザギザの稲妻（ひび）の折れ線。 */
export function zigzag(
	from: { x: number; y: number },
	to: { x: number; y: number },
	rand: () => number,
	minStep = 0.1,
	maxStep = 0.32
) {
	const len = Math.hypot(to.x - from.x, to.y - from.y);
	const pts = [from];
	let p = from;
	let side = rand() < 0.5 ? 1 : -1;
	for (let i = 0; i < 14; i++) {
		const dx = to.x - p.x;
		const dy = to.y - p.y;
		const rest = Math.hypot(dx, dy);
		if (rest < len * 0.14) break;
		const step = Math.min(rest * 0.75, len * (minStep + rand() * (maxStep - minStep)));
		const a = Math.atan2(dy, dx) + (side * (20 + 30 * rand()) * Math.PI) / 180;
		p = { x: p.x + Math.cos(a) * step, y: p.y + Math.sin(a) * step };
		pts.push(p);
		if (rand() < 0.75) side = -side;
	}
	pts.push(to);
	return pts;
}

/** 幹と枝のある稲妻。 */
export function bolt(
	from: { x: number; y: number },
	to: { x: number; y: number },
	rand: () => number,
	branches = 3,
	minStep = 0.1,
	maxStep = 0.32
) {
	const main = zigzag(from, to, rand, minStep, maxStep);
	const len = Math.hypot(to.x - from.x, to.y - from.y);
	const out: { x: number; y: number }[][] = [];
	for (let i = 0; i < branches && main.length > 3; i++) {
		const k = 1 + Math.floor(rand() * (main.length - 2));
		const a0 = main[k];
		const a1 = main[k + 1] ?? to;
		const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x) + (rand() < 0.5 ? -1 : 1) * ((25 + 35 * rand()) * Math.PI) / 180;
		const l = len * (0.1 + 0.16 * rand());
		out.push(zigzag(a0, { x: a0.x + Math.cos(ang) * l, y: a0.y + Math.sin(ang) * l }, rand, 0.3, 0.55));
	}
	return { main, branches: out };
}

export function polyline(ctx: Ctx2D, pts: { x: number; y: number }[], dx = 0, dy = 0) {
	ctx.beginPath();
	ctx.moveTo(pts[0].x + dx, pts[0].y + dy);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + dx, pts[i].y + dy);
	ctx.stroke();
}

/** 4本（＋細い4本）の光の星。 */
export function twinkle(ctx: Ctx2D, x: number, y: number, r: number, inner: number, fill: string) {
	ctx.fillStyle = fill;
	for (const [rr, off] of [
		[r, 0],
		[r * 0.45, Math.PI / 4]
	]) {
		ctx.beginPath();
		for (let i = 0; i < 8; i++) {
			const a = off + (i * Math.PI) / 4;
			const d = i % 2 === 0 ? rr : inner;
			ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
		}
		ctx.closePath();
		ctx.fill();
	}
}
