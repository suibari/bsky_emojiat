/**
 * 炎・闇・凍てつき・雷・溶ける。字の形（alpha）から「場」を作り、その場を色にして描く。
 * どれもループの頭と終わりがつながるよう、時間はノイズの周期か三角関数にだけ入れる。
 */
import { TAU, clamp01, rng, type Ctx2D, type Effect, type Frame, type Surface } from './types';
import {
	alphaGrid,
	bolt,
	css,
	edgePoints,
	frac,
	hash,
	insideDistance,
	mix,
	outward,
	polyline,
	readPixels,
	sampleGrid,
	scratch,
	shrink,
	silhouette,
	smooth,
	twinkle,
	vnoise,
	workSize,
	type RGB
} from './util';

type Pt = { x: number; y: number };

/** 場を作るグリッドの大きさ。高さ 16〜64 マス、横は縦横比に合わせる。 */
function gridSize(f: Frame) {
	const gh = Math.max(16, Math.min(64, Math.round(f.h / 2)));
	return { gw: Math.max(1, Math.round((gh * f.w) / f.h)), gh };
}

/** グリッドの場を、作業解像度で1ピクセルずつ色にして dst に描く。 */
function paintField(
	dst: Ctx2D,
	f: Frame,
	key: string,
	field: Float32Array,
	gw: number,
	gh: number,
	color: (v: number, x: number, y: number) => RGB | null
) {
	const ws = workSize(f);
	const s = scratch(key, ws.w, ws.h);
	const img = s.ctx.createImageData(ws.w, ws.h);
	const d = img.data;
	const kx = gw / ws.w;
	const ky = gh / ws.h;
	for (let y = 0; y < ws.h; y++) {
		const gy = (y + 0.5) * ky - 0.5;
		for (let x = 0; x < ws.w; x++) {
			const c = color(sampleGrid(field, gw, gh, (x + 0.5) * kx - 0.5, gy), x, y);
			if (!c) continue;
			const i = (y * ws.w + x) * 4;
			d[i] = c[0];
			d[i + 1] = c[1];
			d[i + 2] = c[2];
			d[i + 3] = 255;
		}
	}
	s.ctx.putImageData(img, 0, 0);
	dst.drawImage(s.canvas, 0, 0, f.w, f.h);
}

/* ---------- 炎 ---------- */

const FIRE: RGB[] = [
	[255, 250, 215],
	[255, 214, 60],
	[255, 124, 18],
	[205, 30, 8]
];
/** 0（暗い根元）〜1（白く熱い芯）の炎の色。 */
function firePal(t: number): RGB {
	const [hot, yellow, orange, red] = FIRE;
	if (t > 0.8) return mix(yellow, hot, (t - 0.8) / 0.2);
	if (t > 0.55) return mix(orange, yellow, (t - 0.55) / 0.25);
	if (t > 0.3) return mix(red, orange, (t - 0.3) / 0.25);
	return red;
}
const FIRE_EDGE = mix(firePal(0.3), [40, 0, 0], 0.25);

/**
 * 炎の場。各マスは「下のほうにある字」から熱をもらい、上へ行くほど弱まる。
 * 高さごとに左右へ揺らし、ノイズで削って舌のような形にする。
 */
function heatField(a: Float32Array, gw: number, gh: number, t: number, reach: number, speed: number) {
	const out = new Float32Array(gw * gh);
	const fs = gh / 64;
	const R = Math.max(1, reach);
	const lick = t * speed * 8;
	for (let y = 0; y < gh; y++) {
		const up = 1 - y / gh;
		const sway =
			(1.3 * Math.sin((0.32 / fs) * y - t * TAU * speed) + 0.6 * Math.sin((0.71 / fs) * y + t * TAU * speed * 2 + 1.7)) *
			fs *
			(0.5 + up);
		for (let x = 0; x < gw; x++) {
			const local = R * (0.55 + 0.45 * Math.pow(vnoise(x / (6 * fs), t * speed * 4, 4 * speed, 11), 0.8));
			let heat = 0;
			const n = Math.ceil(local);
			for (let k = 0; k <= n; k++) {
				const yy = y + k;
				if (yy >= gh) break;
				const xx = Math.round(x + sway * (k / R + 0.2));
				if (xx < 0 || xx >= gw) continue;
				const v = a[yy * gw + xx];
				if (v <= 0) continue;
				const h = v * (1 - k / local);
				if (h > heat) heat = h;
			}
			if (heat <= 0) continue;
			const gx = x / (4 * fs);
			const erode =
				(0.65 * vnoise(gx, y / (3 * fs) + lick, 8, 3) + 0.35 * vnoise(2.1 * gx, y / (1.5 * fs) + 2 * lick, 8, 7) - 0.35) *
				0.9 *
				(1 - 0.6 * heat);
			out[y * gw + x] = clamp01(heat - (1 - heat) * 0.35 - erode);
		}
	}
	return out;
}

/** 字の上端（上が空いているところ）から舞い上がる火の粉。 */
function embers(ctx: Ctx2D, f: Frame, a: Float32Array, gw: number, gh: number) {
	const kx = f.w / gw;
	const ky = f.h / gh;
	const tops: Pt[] = [];
	for (let x = 0; x < gw; x += 2)
		for (let y = 1; y < gh; y++) if (a[y * gw + x] >= 0.5 && a[(y - 1) * gw + x] < 0.5) tops.push({ x: x * kx, y: y * ky });
	if (!tops.length) return;
	const b = f.s;
	const px = Math.max(1, Math.round(b));
	const t = frac(f.t);
	const rand = rng(37);
	const solid = (x: number, y: number) => sampleGrid(a, gw, gh, x / kx, y / ky) > 0.9;
	const dot = (x: number, y: number, heat: number, size: number) => {
		if (solid(x, y)) return;
		const n = size * px;
		ctx.fillStyle = css(firePal(Math.min(1, Math.max(0.4, heat))));
		ctx.fillRect(Math.round(x - n / 2), Math.round(y - n / 2), n, n);
	};
	for (let i = 0; i < 28; i++) {
		const p = tops[Math.floor(rand() * tops.length)];
		const phase = rand();
		const rise = Math.min((42 + 40 * rand()) * b, p.y - 2 * b);
		const drift = (rand() - 0.5) * 14 * b;
		const wob = (2 + 4 * rand()) * b;
		const freq = 1.2 + 1.8 * rand();
		let size = rand() < 0.65 ? 2 : 1;
		const blinks = 5 + Math.floor(5 * rand());
		const u = frac(2 * t + phase);
		if (u > 0.9) continue;
		const at = (k: number): [number, number] => [
			p.x + drift * k + Math.sin((k * freq + phase) * TAU) * wob * Math.min(1, 4 * k),
			p.y - 3 * b - rise * (1 - Math.pow(1 - k, 1.5))
		];
		let heat = 1 - 0.6 * Math.pow(u, 0.85);
		if (Math.sin((u * blinks + 3 * phase) * TAU) > 0.6) {
			if (size === 1 && u > 0.45) continue;
			heat -= 0.25;
			size = 1;
		}
		// 尾を引く
		const from = Math.max(0, u - 0.06);
		const [x0, y0] = at(from);
		const [x1, y1] = at(u);
		const steps = Math.max(2, Math.ceil((Math.hypot(x1 - x0, y1 - y0) / px) * 2));
		for (let s = 0; s < steps; s++) {
			const k = s / steps;
			const [x, y] = at(from + (u - from) * k);
			dot(x, y, heat - 0.5 + 0.4 * k, 1);
		}
		dot(x1, y1, heat, size);
	}
}

const fire: Effect = {
	id: 'fire',
	category: 'shine',
	label: '炎',
	labelEn: 'Fire',
	description: '輪郭から炎が立ち上り、火の粉が舞う。炎上、アツい、燃えてきた、やる気',
	filter: (dst, src, f) => {
		const input = shrink('fire-in', src, f, 0.95, 1);
		const { gw, gh } = gridSize(f);
		const a = alphaGrid('fire-grid', input, gw, gh);
		const speed = 2;
		const heat = heatField(a, gw, gh, f.t, 0.6 * gh * 0.3, speed);
		if (f.opaque) {
			dst.save();
			dst.globalCompositeOperation = 'lighter';
			const g = dst.createRadialGradient(f.w / 2, f.h * 1.05, 0, f.w / 2, f.h * 1.05, Math.max(f.w, f.h) * 1.1);
			g.addColorStop(0, css(firePal(0.7), 0.15));
			g.addColorStop(1, css(firePal(0.45), 0));
			dst.fillStyle = g;
			dst.fillRect(0, 0, f.w, f.h);
			dst.restore();
		}
		paintField(dst, f, 'fire-out', heat, gw, gh, (v) => {
			if (v < 0.07) return null;
			if (v < 0.15) return FIRE_EDGE;
			return firePal(0.3 + ((v - 0.15) / 0.85) * 0.7);
		});
		dst.drawImage(input, 0, 0);
		embers(dst, f, a, gw, gh);
	}
};

/* ---------- 闇 ---------- */

const DARK = { deep: [6, 1, 12] as RGB, rim: [132, 66, 214] as RGB, light: [196, 128, 255] as RGB };

/** 横と縦（上下で距離を変える）に、距離で弱まる最大値で広げる。 */
function spread(a: Float32Array, gw: number, gh: number, side: number, up: number, down: number) {
	const tmp = new Float32Array(gw * gh);
	const S = Math.ceil(side);
	for (let y = 0; y < gh; y++)
		for (let x = 0; x < gw; x++) {
			let m = 0;
			for (let k = -S; k <= S; k++) {
				const xx = x + k;
				if (xx < 0 || xx >= gw) continue;
				const v = a[y * gw + xx] * (1 - Math.abs(k) / (side + 1));
				if (v > m) m = v;
			}
			tmp[y * gw + x] = m;
		}
	const out = new Float32Array(gw * gh);
	const U = Math.ceil(up);
	const D = Math.ceil(down);
	for (let y = 0; y < gh; y++)
		for (let x = 0; x < gw; x++) {
			let m = 0;
			for (let k = -D; k <= U; k++) {
				const yy = y + k;
				if (yy < 0 || yy >= gh) continue;
				const v = tmp[yy * gw + x] * (1 - Math.abs(k) / ((k >= 0 ? up : down) + 1));
				if (v > m) m = v;
			}
			out[y * gw + x] = m;
		}
	return out;
}

/** 字の外側に、なぞるように色を付けた縁を描く。 */
function ring(dst: Ctx2D, src: Surface, f: Frame, key: string, color: string, r: number) {
	const sil = silhouette(key, src, f, color);
	const n = Math.max(8, Math.min(24, Math.round(r * 4)));
	for (let i = 0; i < n; i++) {
		const a = (i / n) * TAU;
		dst.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
	}
}

const darkness: Effect = {
	id: 'darkness',
	category: 'shine',
	label: '闇',
	labelEn: 'Darkness',
	description: '文字から黒い闇が立ち上る。闇落ち、絶望、ヤバい、中二病',
	filter: (dst, src, f) => {
		const { gw, gh } = gridSize(f);
		const fs = gh / 64;
		const a = alphaGrid('dark-grid', src, gw, gh);
		const base = spread(a, gw, gh, 2 * fs, 12.5 * fs, 0.3 * fs);
		const field = new Float32Array(gw * gh);
		for (let y = 0; y < gh; y++) {
			const sway = 1.2 * Math.sin((0.22 / fs) * y - f.t * TAU) * fs;
			const v = y / (10 * fs) + 2 * f.t;
			for (let x = 0; x < gw; x++) {
				const i = y * gw + x;
				if (base[i] <= 0) continue;
				const m = clamp01((vnoise((x + sway) / (2.5 * fs) + 3.1, v, 2, 5) - 0.25) / 0.5);
				field[i] = base[i] - (1 - m) * 0.6;
			}
		}
		paintField(dst, f, 'dark-out', field, gw, gh, (v) => (v < 0.2 ? null : v < 0.32 ? DARK.light : DARK.deep));
		ring(dst, src, f, 'dark-rim', css(DARK.rim), 2 * f.s);
		dst.drawImage(src, 0, 0);
	}
};

/* ---------- 凍てつき ---------- */

const ICE = {
	white: [255, 255, 255] as RGB,
	light: [214, 244, 255] as RGB,
	mid: [124, 199, 255] as RGB,
	deep: [29, 79, 145] as RGB
};

type Voronoi = { cell: Int32Array; seam: Float32Array; shade: Float32Array; tilt: Float32Array };
const voronoiCache = new Map<string, Voronoi>();

/** 氷のかけらの割れ目。ゆらいだ格子の点のどれに一番近いかで区切る。 */
function voronoi(w: number, h: number, size: number): Voronoi {
	const key = `${w}x${h}:${size.toFixed(2)}`;
	const hit = voronoiCache.get(key);
	if (hit) return hit;
	const cols = Math.ceil(w / size) + 2;
	const rows = Math.ceil(h / size) + 2;
	const sx = new Float32Array(cols * rows);
	const sy = new Float32Array(cols * rows);
	const shadeOf = new Float32Array(cols * rows);
	for (let j = 0; j < rows; j++)
		for (let i = 0; i < cols; i++) {
			const k = j * cols + i;
			sx[k] = (i - 1 + 0.12 + 0.76 * hash(5 + 31 * i, 17 * j)) * size;
			sy[k] = (j - 1 + 0.12 + 0.76 * hash(5 + 13 * i, 29 * j + 7)) * size;
			shadeOf[k] = hash(15 + k, 91);
		}
	const cell = new Int32Array(w * h);
	const seam = new Float32Array(w * h);
	const shade = new Float32Array(w * h);
	const tilt = new Float32Array(w * h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const ci = Math.floor(x / size) + 1;
			const cj = Math.floor(y / size) + 1;
			let d1 = Infinity;
			let d2 = Infinity;
			let best = 0;
			for (let dj = -1; dj <= 1; dj++)
				for (let di = -1; di <= 1; di++) {
					const i = ci + di;
					const j = cj + dj;
					if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
					const k = j * cols + i;
					const d = Math.hypot(x + 0.5 - sx[k], y + 0.5 - sy[k]);
					if (d < d1) {
						d2 = d1;
						d1 = d;
						best = k;
					} else if (d < d2) d2 = d;
				}
			const p = y * w + x;
			cell[p] = best;
			seam[p] = d2 - d1;
			shade[p] = shadeOf[best];
			const ang = shadeOf[best] * TAU;
			tilt[p] = Math.max(-1, Math.min(1, ((x + 0.5 - sx[best]) * Math.cos(ang) + (y + 0.5 - sy[best]) * Math.sin(ang)) / (0.6 * size)));
		}
	const v = { cell, seam, shade, tilt };
	if (voronoiCache.size > 8) voronoiCache.clear();
	voronoiCache.set(key, v);
	return v;
}

function hexagon(ctx: Ctx2D, x: number, y: number, r: number, rot: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos(rot + (i * Math.PI) / 3) * r, y + Math.sin(rot + (i * Math.PI) / 3) * r);
	ctx.closePath();
}

/** 霜の針（三角）。grow で長さを伸び縮みさせる。 */
function spike(ctx: Ctx2D, base: Pt, tip: Pt, width: number, grow: number, pad = 0) {
	const dx = tip.x - base.x;
	const dy = tip.y - base.y;
	const len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len;
	const ny = dx / len;
	const half = width / 2 + pad;
	ctx.beginPath();
	ctx.moveTo(base.x + nx * half, base.y + ny * half);
	ctx.lineTo(base.x + dx * grow + (dx / len) * pad, base.y + dy * grow + (dy / len) * pad);
	ctx.lineTo(base.x - nx * half, base.y - ny * half);
	ctx.closePath();
	ctx.fill();
}

const frostbite: Effect = {
	id: 'frostbite',
	category: 'shine',
	label: '凍てつき',
	labelEn: 'Frostbite',
	description: '凍りついた字のふちに霜の針が生え、ひびが入り、氷のつぶが舞う。凍りついた、さむい、ドン引き',
	filter: (dst, src, f) => {
		const input = shrink('ice-in', src, f, 0.96, 0.5);
		const ws = workSize(f);
		const W = ws.w;
		const H = ws.h;
		const g = H / 128;
		const img = readPixels('ice-px', input, W, H);
		const d = img.data;
		const alpha = new Uint8ClampedArray(d);
		const dist = insideDistance(d, W, H);
		const vo = voronoi(W, H, 17 * g);
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				const p = y * W + x;
				const i = p * 4;
				if (d[i + 3] < 8) continue;
				const tt = 0.35 + 0.22 * (vo.shade[p] - 0.5) + 0.28 * vo.tilt[p] + 0.2 * (1 - y / H);
				let c = tt < 0.5 ? mix(ICE.deep, ICE.mid, 2 * tt) : mix(ICE.mid, ICE.light, (tt - 0.5) * 2);
				c = mix([d[i], d[i + 1], d[i + 2]], c, 0.5);
				if (vo.seam[p] < 0.9 * g) c = mix(c, ICE.light, 0.35);
				c = dist[p] < 1.5 * g ? mix(c, ICE.mid, 0.7) : mix(c, ICE.white, 0.8 * Math.exp(-(dist[p] - 1.5 * g) / (1.1 * g)));
				d[i] = c[0];
				d[i + 1] = c[1];
				d[i + 2] = c[2];
			}
		const glyph = scratch('ice-glyph', W, H);
		glyph.ctx.putImageData(img, 0, 0);

		// 以降は作業解像度の座標で描く
		dst.save();
		dst.scale(f.w / W, f.h / H);
		dst.drawImage(glyph.canvas, 0, 0);

		// 霜の針: 上や横を向いたふちから生える
		const edges = edgePoints(alpha, W, H, 2);
		const rand = rng(61);
		const ferns: { spikes: { base: Pt; tip: Pt; w: number }[]; tip: Pt; base: Pt; phase: number }[] = [];
		for (let k = 0; k < 600 && ferns.length < 22 && edges.length; k++) {
			const e = edges[Math.floor(rand() * edges.length)];
			const n = outward(alpha, W, H, e, 4);
			if (n.y > 0.35) continue;
			if (ferns.some((fe) => Math.hypot(fe.base.x - e.x, fe.base.y - e.y) < 8 * g)) continue;
			const ang = Math.atan2(n.y, n.x) + (rand() - 0.5) * 0.5;
			const len = (5 + 7 * rand()) * g;
			const base = { x: e.x + 0.5 - 1.5 * n.x * g, y: e.y + 0.5 - 1.5 * n.y * g };
			const count = rand() < 0.5 ? 2 : 3;
			const spikes = [];
			for (let s = 0; s < count; s++) {
				const center = s === Math.floor(count / 2);
				const a = ang + (s - (count - 1) / 2) * (0.45 + 0.3 * rand()) + (rand() - 0.5) * 0.2;
				const l = len * (center ? 1 : 0.45 + 0.35 * rand());
				spikes.push({ base, tip: { x: base.x + Math.cos(a) * l, y: base.y + Math.sin(a) * l }, w: 2.4 * g * (center ? 1 : 0.75) });
			}
			ferns.push({ spikes, base, tip: { x: base.x + Math.cos(ang) * len, y: base.y + Math.sin(ang) * len }, phase: rand() });
		}
		const grow = (fe: (typeof ferns)[number]) => 0.8 + 0.2 * Math.sin((f.t + fe.phase) * TAU);
		dst.fillStyle = css(ICE.mid);
		for (const fe of ferns) for (const s of fe.spikes) spike(dst, s.base, s.tip, s.w, grow(fe), 0.7 * g);
		dst.fillStyle = css(ICE.white);
		for (const fe of ferns) for (const s of fe.spikes) spike(dst, s.base, s.tip, s.w, grow(fe));
		ferns.forEach((fe, i) => {
			const p = frac(2 * f.t + 0.29 * i);
			if (p >= 0.12) return;
			const k = grow(fe);
			const r = 6 * g * Math.sin((p / 0.12) * Math.PI);
			const x = fe.base.x + (fe.tip.x - fe.base.x) * k;
			const y = fe.base.y + (fe.tip.y - fe.base.y) * k;
			twinkle(dst, x, y, 1.12 * r, 0.2 * r, css(ICE.mid));
			twinkle(dst, x, y, r, 0.11 * r, css(ICE.white));
		});

		// ひび: 字の中心付近から放射状に。字の外にははみ出さない
		let center = { x: 0.44 * W, y: 0.42 * H };
		let best = Infinity;
		for (let y = 0; y < H; y += 2)
			for (let x = 0; x < W; x += 2) {
				if (alpha[(y * W + x) * 4 + 3] < 128) continue;
				const dd = (x - 0.44 * W) ** 2 + (y - 0.42 * H) ** 2;
				if (dd < best) {
					best = dd;
					center = { x, y };
				}
			}
		if (best < Infinity) {
			const cr = rng(41);
			const crack = scratch('ice-cracks', W, H);
			const c = crack.ctx;
			c.lineCap = 'butt';
			c.lineJoin = 'miter';
			const start = cr() * TAU;
			const lines = Array.from({ length: 6 }, (_, i) => {
				const a = start + (i / 6) * TAU + (cr() - 0.5) * 0.7;
				const l = H * (0.28 + 0.3 * cr());
				return bolt(center, { x: center.x + Math.cos(a) * l, y: center.y + Math.sin(a) * l }, cr, 1, 0.3, 0.55);
			});
			c.strokeStyle = css(ICE.deep);
			for (const b of lines) {
				c.lineWidth = g;
				for (const br of b.branches) polyline(c, br, 0.8 * g, 0.8 * g);
				c.lineWidth = 1.3 * g;
				polyline(c, b.main, 0.9 * g, 0.9 * g);
			}
			for (const b of lines) {
				c.strokeStyle = css(ICE.light);
				c.lineWidth = 0.8 * g;
				for (const br of b.branches) polyline(c, br);
				c.strokeStyle = css(ICE.white);
				c.lineWidth = 1.2 * g;
				polyline(c, b.main);
			}
			c.globalCompositeOperation = 'destination-in';
			c.drawImage(glyph.canvas, 0, 0);
			c.globalCompositeOperation = 'source-over';
			dst.drawImage(crack.canvas, 0, 0);
		}

		// 舞う氷のつぶ
		const mr = rng(88);
		for (let i = 0; i < 16; i++) {
			const x0 = (0.06 + 0.88 * mr()) * W;
			const y0 = mr() * H;
			const flake = mr() < 0.4;
			const p = mr();
			const size = (flake ? 3.5 + 2.5 * mr() : 2.5 + 2.5 * mr()) * g;
			const y = (y0 + frac(f.t) * H) % H;
			const x = x0 + 3 * Math.sin((f.t + p) * TAU) * g;
			if (flake) {
				const rot = p * Math.PI + (Math.PI / 3) * f.t * (i % 2 === 0 ? 1 : -1);
				hexagon(dst, x, y, size, rot);
				dst.fillStyle = css(ICE.white);
				dst.fill();
				hexagon(dst, x, y, 0.62 * size, rot);
				dst.fillStyle = css(ICE.light);
				dst.fill();
			} else {
				const k = Math.max(0, Math.sin(frac(2 * f.t + p) * TAU));
				if (k > 0.15) {
					twinkle(dst, x, y, 1.12 * size * k, 0.2 * size * k, css(ICE.mid));
					twinkle(dst, x, y, size * k, 0.11 * size * k, css(ICE.white));
				}
			}
		}
		dst.restore();
	}
};

/* ---------- 雷 ---------- */

const ELEC = {
	white: [255, 255, 255] as RGB,
	light: [200, 244, 255] as RGB,
	mid: [63, 169, 255] as RGB,
	deep: [26, 36, 102] as RGB
};

/** ループ1回に1度の落雷。0.4 から 1/16 刻みで「落ちる → 光る → 色ずれ → 収まる」。 */
function strike(t: number) {
	const p = frac(t);
	const calm = { frame: Math.floor(40 * p), burst: 0, bolt: false, flash: false, aberration: false, shake: [0, 0] };
	const step = Math.floor((p - 0.4) * 16);
	if (p < 0.4 || step >= 6) return calm;
	const burst = step >= 5 ? 0 : step <= 1 ? 1 : Math.exp(-(p - 0.4 - 2 / 16) / (0.9 / 16));
	const shake = step === 1 ? [2, -1] : step === 2 ? [-2, 1] : step === 3 ? [1, 1] : [0, 0];
	return { ...calm, burst, bolt: step <= 1, flash: step === 1, aberration: step === 2, shake };
}

/** 先へ行くほど細くなる線で稲妻を描く。 */
function drawBolt(ctx: Ctx2D, b: { main: Pt[]; branches: Pt[][] }, lw: number) {
	ctx.save();
	ctx.lineCap = 'round';
	const taper = (pts: Pt[], color: string, w0: number, w1: number) => {
		const n = pts.length - 1;
		ctx.strokeStyle = color;
		for (let i = 0; i < n; i++) {
			ctx.lineWidth = w0 + (i / Math.max(1, n - 1)) * (w1 - w0);
			ctx.beginPath();
			ctx.moveTo(pts[i].x, pts[i].y);
			ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
			ctx.stroke();
		}
	};
	for (const br of b.branches) taper(br, css(ELEC.light), 2.6 * lw, 1.6 * lw);
	taper(b.main, css(ELEC.light), 5 * lw, 3 * lw);
	for (const br of b.branches) taper(br, css(ELEC.white), 1.1 * lw, 0.8 * lw);
	taper(b.main, css(ELEC.white), 2 * lw, 1.2 * lw);
	ctx.restore();
}

const noise = (x: number, y: number, seed: number) => vnoise(x, y, 1 << 20, seed);

const lightning: Effect = {
	id: 'lightning',
	category: 'shine',
	label: '雷',
	labelEn: 'Lightning',
	description: '字の中を電気が這い、ときどき稲妻が落ちて白く光る。ヤバい、覚醒、衝撃、ビリビリ',
	filter: (dst, src, f) => {
		const st = strike(f.t);
		const slot = Math.floor(st.frame / 2);
		const input = shrink('elec-in', src, f, 0.98, 0.5);
		const ws = workSize(f);
		const W = ws.w;
		const H = ws.h;
		const g = H / 128;
		const img = readPixels('elec-px', input, W, H);
		const d = img.data;
		const alpha = new Uint8ClampedArray(d);
		const dist = insideDistance(d, W, H);

		// 稲妻が落ちる先: 真ん中寄りで一番高い字の頭
		let target = { x: W / 2, y: 0.35 * H };
		let score = Infinity;
		for (let x = Math.floor(0.35 * W); x <= 0.65 * W; x += 2)
			for (let y = 0; y < H; y++) {
				if (alpha[(y * W + x) * 4 + 3] < 128) continue;
				const s = y + 0.4 * Math.abs(x - W / 2);
				if (s < score) {
					score = s;
					target = { x, y };
				}
				break;
			}
		target = { x: target.x, y: target.y + 0.08 * H };

		// 字の中を這う電気の筋（ゆがめたノイズの尾根）とふちの光
		const ph = frac(f.t) * TAU;
		const m = 2.2 * Math.cos(ph);
		const q = 2.2 * Math.sin(ph);
		const M = 1 / (22 * g);
		const B = 1 / (13 * g);
		const X = 1 / (5 * g);
		const plasma = Math.max(0.8, st.burst);
		const density = 0.55 + 0.3 * st.burst;
		const rim = 0.8 + 0.2 * st.burst;
		const seed = 100 + (st.frame % 97);
		for (let y = 0; y < H; y++)
			for (let x = 0; x < W; x++) {
				const p = y * W + x;
				const i = p * 4;
				if (d[i + 3] < 8) continue;
				let c: RGB = [d[i], d[i + 1], d[i + 2]];
				const mask = smooth((noise(x * M * 0.8 + q, y * M * 0.8 - m, 21) - (0.62 - 0.3 * density)) / 0.18);
				if (mask > 0) {
					const e1 = 2 * noise(x * M + m, y * M + q, 11) - 1;
					const e2 = 2 * noise(x * M - q, y * M + m, 12) - 1;
					const n1 = noise(x * B + 1.6 * e1 + 0.4 * m, y * B + 1.6 * e2 + 0.4 * q, 7) + (noise(x * X, y * X, seed) - 0.5) * 0.07;
					const n2 =
						noise(x * B * 1.9 - 1.2 * e2 - 0.6 * q, y * B * 1.9 + 1.2 * e1 + 0.6 * m, 8) + (noise(x * X, y * X, seed + 1) - 0.5) * 0.08;
					const ridge = Math.max(1 - Math.abs(2 * n1 - 1), (1 - Math.abs(2 * n2 - 1)) * 0.97);
					const glow = smooth((ridge - 0.66) / 0.26) * mask * plasma;
					const core = smooth((ridge - 0.925) / 0.05) * mask * plasma;
					c = [Math.min(255, c[0] + ELEC.mid[0] * 0.45 * glow), Math.min(255, c[1] + ELEC.mid[1] * 0.45 * glow), Math.min(255, c[2] + ELEC.mid[2] * 0.45 * glow)];
					c = mix(c, ELEC.light, 0.9 * core);
					c = mix(c, ELEC.white, core * core);
				}
				if (st.flash) c = ELEC.white;
				const edge = Math.exp(-(dist[p] - 1) / (1.3 * g));
				if (!st.flash) {
					const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
					c = mix(c, mix(ELEC.light, ELEC.mid, smooth((lum - 150) / 80)), edge * rim * 0.85);
					c = mix(c, ELEC.white, edge * edge * rim * 0.2);
				} else if (dist[p] < 2 * g) c = ELEC.mid;
				d[i] = c[0];
				d[i + 1] = c[1];
				d[i + 2] = c[2];
			}
		const glyph = scratch('elec-glyph', W, H);
		glyph.ctx.putImageData(img, 0, 0);

		dst.save();
		if (f.opaque && st.burst > 0) {
			const tx = (target.x * f.w) / W;
			const ty = (target.y * f.h) / H;
			const grad = dst.createRadialGradient(tx, ty, 0, tx, ty, 0.9 * Math.max(f.w, f.h));
			grad.addColorStop(0, css(ELEC.light, 0.85 * st.burst));
			grad.addColorStop(0.4, css(ELEC.mid, 0.45 * st.burst));
			grad.addColorStop(1, css(ELEC.mid, 0));
			dst.globalCompositeOperation = 'lighter';
			dst.fillStyle = grad;
			dst.fillRect(0, 0, f.w, f.h);
			dst.globalCompositeOperation = 'source-over';
		}
		dst.translate(Math.round(st.shake[0] * f.s), Math.round(st.shake[1] * f.s));
		if (st.aberration) {
			const off = Math.round(2 * f.s);
			dst.drawImage(silhouette('elec-cyan', input, f, '#00e5ff'), -off, 0);
			dst.drawImage(silhouette('elec-magenta', input, f, '#ff3df0'), off, 0);
		}
		dst.drawImage(glyph.canvas, 0, 0, f.w, f.h);

		// 稲妻（落雷）と、ふちから飛ぶ小さな放電
		dst.scale(f.w / W, f.h / H);
		if (st.bolt) {
			const r = rng(73);
			drawBolt(dst, bolt({ x: W * (0.62 + 0.2 * r()), y: -4 }, target, r, 3), 1.1 * g);
		} else if (st.burst === 0) {
			const k = hash(slot, 9);
			const count = k < 0.12 ? 2 : k < 0.45 ? 1 : 0;
			const edges = count ? edgePoints(alpha, W, H, 2) : [];
			const r = rng(131 * slot + 17);
			for (let i = 0; i < count && edges.length; i++) {
				const e = edges[Math.floor(r() * edges.length)];
				const n = outward(alpha, W, H, e, 4);
				const len = 22 * g * (0.7 + 0.6 * r());
				const a = Math.atan2(n.y, n.x) + (r() - 0.5) * 0.9;
				const from = { x: e.x + 0.5 - 2 * n.x, y: e.y + 0.5 - 2 * n.y };
				drawBolt(dst, bolt(from, { x: e.x + Math.cos(a) * len, y: e.y + Math.sin(a) * len }, r, r() < 0.5 ? 1 : 2, 0.28, 0.5), 0.75 * g);
			}
		}
		dst.restore();
	}
};

/* ---------- 溶ける ---------- */

type Drip = { kind: 'stream' | 'drip' | 'thin'; x: number; y0: number; r: number; max: number; rate: number; phase: number };

/** 雫の今の形。drip/thin は伸びて、先がちぎれて落ちる。stream は水たまりまで流れ続ける。 */
function dripState(dr: Drip, t: number, floor: number) {
	const o = frac(t * dr.rate + dr.phase);
	const flow = frac(t + dr.phase);
	if (dr.kind === 'stream') return { tip: floor + dr.r, bulb: dr.r, neck: dr.r, drop: null, flow };
	const room = Math.max(0, floor - dr.y0 - 1.6 * dr.r);
	const len = Math.min(dr.max, room);
	const start = 0.25 * len;
	if (o < 0.8) {
		const k = o / 0.8;
		return {
			tip: dr.y0 + start + (len - start) * Math.pow(k, 1.7),
			bulb: dr.r * (1 + 0.2 * k),
			neck: dr.r * (0.9 - 0.5 * smooth((k - 0.8) / 0.2)),
			drop: null,
			flow
		};
	}
	const k = (o - 0.8) / 0.2;
	const r = 1.15 * dr.r;
	const from = dr.y0 + len;
	return {
		tip: dr.y0 + start + (0.5 * len - start) * (1 - smooth(k)),
		bulb: dr.r * (0.75 + 0.25 * smooth(k)),
		neck: 0.9 * dr.r,
		drop: { y: from + k * k * (floor + 2 * r - from) * 1.6, r: r * (1 - 0.35 * smooth((k - 0.5) / 0.5)) },
		flow
	};
}

const melt: Effect = {
	id: 'melt',
	category: 'break',
	label: '溶ける',
	labelEn: 'Melt',
	description: '文字の下がとろけて雫が垂れ、下に水たまりができる。溶ける、暑い、とろける、ぐったり',
	filter: (dst, src, f) => {
		const input = shrink('melt-in', src, f, 0.86, 0.05);
		const ws = workSize(f);
		const W = ws.w;
		const H = ws.h;
		const g = H / 128;
		const amount = 1;
		const { data } = readPixels('melt-px', input, W, H);
		const px = (x: number, y: number): RGB => {
			const i = (y * W + x) * 4;
			return [data[i], data[i + 1], data[i + 2]];
		};
		// 各列の一番下の不透明ピクセル
		const bottom = new Int16Array(W).fill(-1);
		let first = -1;
		let last = -1;
		for (let x = 0; x < W; x++) {
			for (let y = H - 1; y >= 0; y--)
				if (data[(y * W + x) * 4 + 3] >= 128) {
					bottom[x] = y;
					break;
				}
			if (bottom[x] >= 0) {
				if (first < 0) first = x;
				last = x;
			}
		}
		const out = scratch('melt-out', W, H);
		const c = out.ctx;
		c.drawImage(input, 0, 0, W, H);
		if (first < 0) {
			dst.drawImage(out.canvas, 0, 0, f.w, f.h);
			return;
		}
		// 雫の位置: 少しずつずらしながら、近くで一番低いところから垂らす
		const drips: Drip[] = [];
		let x = first + 5 * g;
		let n = 0;
		while (x < last - 4 * g) {
			let at = -1;
			for (let k = -5 * g; k <= 5 * g; k++) {
				const xx = Math.round(x + k);
				if (xx < first || xx > last || bottom[xx] < 0) continue;
				if (at < 0 || bottom[xx] > bottom[at]) at = xx;
			}
			const kind = n % 4 === 1 ? 'stream' : n % 2 === 0 ? 'drip' : 'thin';
			if (at >= 0) {
				const r1 = hash(n, 512);
				const r = (kind === 'stream' ? 5.5 + 1.2 * r1 : kind === 'drip' ? 4.6 + 1.2 * r1 : 3 + 0.6 * r1) * g;
				drips.push({
					kind,
					x: at,
					y0: bottom[at],
					r: r * (0.7 + 0.3 * amount),
					max: (kind === 'drip' ? 22 + 10 * hash(n, 513) : 11 + 6 * hash(n, 513)) * g * amount,
					rate: kind === 'thin' ? 2 : 1,
					phase: 0.14 * hash(n, 514) + (kind === 'thin' ? 0.5 : 0)
				});
			}
			x += (kind === 'thin' ? 12 : 17) * g + 4 * g * hash(n, 515);
			n++;
		}
		const floor = H - 4 * g * amount;
		const states = drips.map((dr) => dripState(dr, f.t, floor));

		// 雫の色: 外側は字の下端の色（縁取り）、内側は少し上の色（塗り）
		const colors = drips.map((dr) => {
			const outer = px(dr.x, dr.y0);
			for (let k = 1; k <= 16 * g; k++) {
				const y = dr.y0 - k;
				if (y < 0 || data[(y * W + dr.x) * 4 + 3] < 230) break;
				const p = px(dr.x, y);
				if (Math.abs(p[0] - outer[0]) + Math.abs(p[1] - outer[1]) + Math.abs(p[2] - outer[2]) > 90) {
					return { outer, inner: px(dr.x, Math.max(0, y - Math.round(2 * g))), line: Math.min(k, 2.5 * g) };
				}
			}
			return { outer, inner: outer, line: 0 };
		});

		const radiusAt = (dr: Drip, s: ReturnType<typeof dripState>, y: number) => {
			const span = Math.max(0.001, s.tip - dr.y0);
			const q = (y - dr.y0) / span;
			let r: number;
			if (dr.kind === 'stream') {
				const wave = Math.sin(TAU * ((y - dr.y0) / (13 * g) - s.flow));
				r = dr.r * (1 - 0.38 * Math.sin(Math.PI * clamp01(q))) * (1 + 0.16 * wave);
			} else r = q < 0.7 ? dr.r + (s.neck - dr.r) * smooth(q / 0.7) : s.neck + (s.bulb - s.neck) * smooth((q - 0.7) / 0.3);
			// 付け根はなだらかに広げて、字とつながって見せる
			const root = 1 - (y - dr.y0 + dr.r) / (2 * dr.r);
			if (root > 0) r += dr.r * 1.2 * root * root;
			return r;
		};
		const shape = (dr: Drip, s: ReturnType<typeof dripState>, grow: number, from: number) => {
			for (let y = Math.floor(from); y < s.tip; y++) {
				const r = radiusAt(dr, s, y) + grow;
				if (r > 0) c.fillRect(dr.x - r, y, 2 * r, 1);
			}
			// 内側は縁取りの太さぶん細いので、細い雫では半径が尽きることがある
			if (dr.kind !== 'stream' && s.bulb + grow > 0) {
				c.beginPath();
				c.arc(dr.x, s.tip, s.bulb + grow, 0, TAU);
				c.fill();
			}
			if (s.drop && s.drop.y - s.drop.r < H && s.drop.r + grow > 0) {
				c.beginPath();
				c.ellipse(dr.x, s.drop.y, s.drop.r + grow, (s.drop.r + grow) * 1.15, 0, 0, TAU);
				c.fill();
			}
		};
		// 水たまり: 雫の落ちるところほど盛り上がる
		const top = new Float32Array(W);
		for (let xx = 0; xx < W; xx++) {
			const edge = smooth((xx - (first - 2 * g)) / (10 * g)) * smooth((last + 2 * g - xx) / (10 * g));
			let h = 3 * g;
			drips.forEach((dr, i) => {
				const k = (xx - dr.x) / (2.2 * dr.r);
				h += Math.exp(-k * k) * dr.r * 0.55;
				const drop = states[i].drop;
				if (drop && drop.y > floor - drop.r) {
					const k2 = (xx - dr.x) / (1.6 * dr.r);
					h += 2.5 * Math.exp(-k2 * k2) * g * (1 - clamp01((drop.y - floor) / (3 * drop.r)));
				}
			});
			top[xx] = h * edge * amount;
		}
		const puddle = (grow: number) => {
			c.beginPath();
			c.moveTo(0, H);
			for (let xx = 0; xx < W; xx++) c.lineTo(xx, H - Math.max(0, top[xx] + (top[xx] > 0.3 ? grow : 0)));
			c.lineTo(W, H);
			c.closePath();
			c.fill();
		};
		const outerColor = colors[0]?.outer ?? [0, 0, 0];
		const innerColor = colors[0]?.inner ?? outerColor;
		const line = colors[0]?.line ?? 0;
		c.fillStyle = css(outerColor);
		puddle(0);
		drips.forEach((dr, i) => {
			c.fillStyle = css(colors[i].outer);
			// 縁取りの色は字の下端から下だけ。上まで塗ると字の塗りに被る
			shape(dr, states[i], 0, colors[i].line > 0 ? dr.y0 : dr.y0 - dr.r);
		});
		if (line > 0) {
			c.fillStyle = css(innerColor);
			puddle(-line);
		}
		drips.forEach((dr, i) => {
			if (colors[i].line <= 0) return;
			c.fillStyle = css(colors[i].inner);
			shape(dr, states[i], -colors[i].line, dr.y0 - dr.r - colors[i].line - g);
		});
		// つや
		c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
		c.lineCap = 'round';
		drips.forEach((dr, i) => {
			const s = states[i];
			if (dr.kind === 'stream') return;
			const y1 = s.tip - 0.3 * s.bulb;
			const y0 = Math.max(dr.y0 + 3 * g, y1 - 9 * g);
			if (y1 - y0 <= 5 * g) return;
			c.lineWidth = Math.max(g, 0.3 * dr.r);
			c.beginPath();
			c.moveTo(dr.x - 0.35 * s.neck, y0);
			c.lineTo(dr.x - 0.35 * s.bulb, y1);
			c.stroke();
		});
		dst.drawImage(out.canvas, 0, 0, f.w, f.h);
	}
};

export const elementShine: Effect[] = [fire, darkness, frostbite, lightning];
export const elementBreak: Effect[] = [melt];
