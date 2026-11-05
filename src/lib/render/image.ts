import type { ImageFit, ImageSource } from './recipe';
import type { Surface } from './effects';

/** 取り込むときの長辺。4:1 を 2 倍で表示しても粗くならない大きさにとどめる。 */
export const IMPORT_MAX_SIDE = 1024;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 枠（box）の中に画像を置く位置。contain は全体が収まる大きさ、cover は枠を埋める大きさを zoom 1 とする。
 * x, y は枠の幅・高さに対するずれ。
 */
export function imageRect(
	iw: number,
	ih: number,
	box: Rect,
	opts: { fit: ImageFit; zoom: number; x: number; y: number }
): Rect {
	const fitScale = opts.fit === 'cover' ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
	const s = fitScale * opts.zoom;
	const w = iw * s;
	const h = ih * s;
	return {
		x: box.x + (box.w - w) / 2 + opts.x * box.w,
		y: box.y + (box.h - h) / 2 + opts.y * box.h,
		w,
		h
	};
}

/**
 * 外周からつながっている「背景らしい色」を透明にする（塗りつぶしツールと同じ考え方）。
 * 外周の各画素を起点に、起点の色との差が tolerance 以内の隣を広げていく。
 * 境目の少し外側は半透明にして、ぎざぎざを抑える。data は RGBA で書き換える。
 */
export function removeBackground(data: Uint8ClampedArray, w: number, h: number, tolerance: number) {
	const n = w * h;
	if (n === 0) return;
	const tol = tolerance * 441.7; // RGB の最大距離 √(3·255²)
	const soft = tol * 1.6 + 8;
	const ref = new Int32Array(n).fill(-1);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	const dist = (i: number, r: number) => {
		const a = i * 4;
		const b = r * 4;
		const dr = data[a] - data[b];
		const dg = data[a + 1] - data[b + 1];
		const db = data[a + 2] - data[b + 2];
		return Math.sqrt(dr * dr + dg * dg + db * db);
	};
	const seed = (i: number) => {
		if (ref[i] !== -1) return;
		ref[i] = i;
		queue[tail++] = i;
	};
	for (let x = 0; x < w; x++) {
		seed(x);
		seed((h - 1) * w + x);
	}
	for (let y = 0; y < h; y++) {
		seed(y * w);
		seed(y * w + w - 1);
	}
	// 元から透明な画素はどの色ともつながる（透過 PNG の外側を素通りさせる）
	const alpha = new Uint8ClampedArray(n);
	for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];
	while (head < tail) {
		const i = queue[head++];
		const r = ref[i];
		data[i * 4 + 3] = 0;
		const x = i % w;
		const y = (i - x) / w;
		const visit = (j: number) => {
			if (ref[j] !== -1) return;
			const d = alpha[j] === 0 ? 0 : dist(j, r);
			if (d <= tol) {
				ref[j] = r;
				queue[tail++] = j;
			} else if (d < soft) {
				// 境目: 透明にはせず、近さに応じて薄くする（広げない）
				const k = (d - tol) / (soft - tol);
				data[j * 4 + 3] = Math.min(data[j * 4 + 3], Math.round(alpha[j] * k));
			}
		};
		if (x > 0) visit(i - 1);
		if (x < w - 1) visit(i + 1);
		if (y > 0) visit(i - w);
		if (y < h - 1) visit(i + w);
	}
}

/**
 * 塗りつぶし（バケツ）。押した画素と色・透明度が近い、つながった範囲を color で塗る。
 * 線のふちの半透明な画素も塗れるよう、透明度の差も距離に含める。
 */
export function floodFill(
	data: Uint8ClampedArray,
	w: number,
	h: number,
	sx: number,
	sy: number,
	color: [number, number, number, number],
	tolerance: number
) {
	if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
	const start = (sy * w + sx) * 4;
	const seed = [data[start], data[start + 1], data[start + 2], data[start + 3]];
	if (seed.every((v, i) => v === color[i])) return;
	const tol = tolerance * 510; // RGBA の最大距離 √(4·255²)
	const seen = new Uint8Array(w * h);
	const stack = [sy * w + sx];
	seen[sy * w + sx] = 1;
	const near = (i: number) => {
		const a = i * 4;
		// 透明な画素は色を持たないとみなす（消しゴムの跡を同じ透明として扱う）
		const ta = data[a + 3] === 0 && seed[3] === 0;
		if (ta) return true;
		let d = 0;
		for (let k = 0; k < 4; k++) d += (data[a + k] - seed[k]) ** 2;
		return Math.sqrt(d) <= tol;
	};
	while (stack.length) {
		const i = stack.pop()!;
		data.set(color, i * 4);
		const x = i % w;
		const y = (i - x) / w;
		for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
			if (j < 0 || seen[j]) continue;
			seen[j] = 1;
			if (near(j)) stack.push(j);
		}
	}
}

/* ---------- ブラウザ側の読み込み ---------- */

function newSurface(w: number, h: number): Surface {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

async function decode(src: Blob | string): Promise<ImageBitmap> {
	const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
	return createImageBitmap(blob);
}

function toDataUrl(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	draw(ctx);
	return canvasToDataUrl(c);
}

/** 画像として取っておくための data URL。描いた絵は線がにじまないよう lossless（PNG）にする。 */
export function canvasToDataUrl(c: HTMLCanvasElement, lossless = false) {
	if (lossless) return c.toDataURL('image/png');
	// WebP が書けないブラウザ（Safari）は PNG になる。どちらも透過を保つ
	const webp = c.toDataURL('image/webp', 0.92);
	return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

/** ファイルや貼り付けた画像を、長辺 IMPORT_MAX_SIDE 以下の data URL にする。アニメ GIF は最初のコマになる。 */
export async function importImage(file: Blob): Promise<string> {
	if (!file.type.startsWith('image/')) throw new Error('not an image');
	const bmp = await decode(file);
	try {
		const s = Math.min(1, IMPORT_MAX_SIDE / Math.max(bmp.width, bmp.height));
		const w = Math.max(1, Math.round(bmp.width * s));
		const h = Math.max(1, Math.round(bmp.height * s));
		return toDataUrl(w, h, (ctx) => {
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bmp, 0, 0, w, h);
		});
	} finally {
		bmp.close();
	}
}

/** 背景抜きまで済ませた画像。描画は同期で行うので、先に ensureImage で用意しておく。 */
const ready = new Map<string, Surface>();
const pending = new Map<string, Promise<void>>();
const keyOf = (img: ImageSource) => (img.removeBg ? `${img.tolerance.toFixed(3)}|${img.src}` : img.src);

/** 作り直しのたびに増えないよう、直近のものだけ持つ。 */
const MAX_CACHED = 12;

export function ensureImage(img: ImageSource): Promise<void> {
	const key = keyOf(img);
	if (ready.has(key)) return Promise.resolve();
	let p = pending.get(key);
	if (!p) {
		p = (async () => {
			const bmp = await decode(img.src);
			const surface = newSurface(bmp.width, bmp.height);
			const ctx = surface.getContext('2d', { willReadFrequently: true }) as
				| CanvasRenderingContext2D
				| OffscreenCanvasRenderingContext2D;
			ctx.drawImage(bmp, 0, 0);
			bmp.close();
			if (img.removeBg) {
				const data = ctx.getImageData(0, 0, surface.width, surface.height);
				removeBackground(data.data, surface.width, surface.height, img.tolerance);
				ctx.putImageData(data, 0, 0);
			}
			ready.set(key, surface);
			while (ready.size > MAX_CACHED) ready.delete(ready.keys().next().value!);
		})().finally(() => pending.delete(key));
		pending.set(key, p);
	}
	return p;
}

export const imageSurface = (img: ImageSource) => ready.get(keyOf(img)) ?? null;
