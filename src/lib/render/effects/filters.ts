/** 色・光・崩す・飾るのエフェクト（追加分のうち、仕組みが単純なもの）。 */
import { TAU, clamp01, type Effect } from './types';
import { drawT, frac, gradientLut, hash, hexRgb, luma, mapPixels, scratch } from './util';

const contrast = (v: number, k: number) => (v - 128) * k + 128;

/** RGB → 色相（度）。無彩色は -1。 */
function hue(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	if (d === 0) return -1;
	const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
	return h < 0 ? h + 360 : h;
}

const GOLD = gradientLut([
	{ at: 0, color: '#2e1d03' },
	{ at: 0.2, color: '#9c6a14' },
	{ at: 0.38, color: '#fff4b8' },
	{ at: 0.52, color: '#e3b021' },
	{ at: 0.66, color: '#6f4a0d' },
	{ at: 0.82, color: '#ffe57a' },
	{ at: 1, color: '#fffbe6' }
]);
const TRITONE = gradientLut([
	{ at: 0, color: '#1e1b4b' },
	{ at: 0.5, color: '#e11d48' },
	{ at: 1, color: '#fde68a' }
]);
const KEEP_HUE = hue(...hexRgb('#ef4444'));

export const moreColor: Effect[] = [
	{
		id: 'party',
		category: 'color',
		label: 'パーティ',
		labelEn: 'Party',
		description: '色がぱっぱっと順に切り替わる。パーティー、お祭り、ノリノリ、テンション最高',
		paint: (ctx, f) => {
			const n = 6;
			const step = Math.floor(f.t * n * 2) % n;
			ctx.fillStyle = `hsl(${Math.round((step / n) * 360)} 90% 55%)`;
			ctx.fillRect(0, 0, f.w, f.h);
		}
	},
	{
		id: 'mono',
		category: 'color',
		label: 'モノクロ',
		labelEn: 'Mono',
		description: '色を落として白黒にする。昔の、回想、しんみり、無の境地',
		filter: (dst, src, f) =>
			mapPixels(dst, src, f, 'fx-mono', (d, i) => {
				const v = contrast(luma(d[i], d[i + 1], d[i + 2]), 1.1);
				d[i] = d[i + 1] = d[i + 2] = v;
			})
	},
	{
		id: 'posterize',
		category: 'color',
		label: '減色',
		labelEn: 'Posterize',
		description: '色の段数を減らしてべったり平らにする。レトロ、ポップ、版画風',
		filter: (dst, src, f) => {
			const step = 255 / 3;
			mapPixels(dst, src, f, 'fx-posterize', (d, i) => {
				for (let c = 0; c < 3; c++) d[i + c] = Math.round(clamp01(contrast(d[i + c], 1.2) / 255) * 3) * step;
			});
		}
	},
	{
		id: 'tritone',
		category: 'color',
		label: 'トライトーン',
		labelEn: 'Tritone',
		description: '暗い所・中間・明るい所を紺・紅・クリームの3色に置き換える。レトロ、ポスター、おしゃれ',
		filter: (dst, src, f) =>
			mapPixels(dst, src, f, 'fx-tritone', (d, i) => {
				const k = (luma(d[i], d[i + 1], d[i + 2]) | 0) * 3;
				d[i] = TRITONE[k];
				d[i + 1] = TRITONE[k + 1];
				d[i + 2] = TRITONE[k + 2];
			})
	},
	{
		id: 'metal',
		category: 'color',
		label: 'メタル化',
		labelEn: 'Metal',
		description: '金ぴかの金属の光り方に置き換える。ゴールド、優勝、豪華、金メダル',
		filter: (dst, src, f) =>
			mapPixels(dst, src, f, 'fx-metal', (d, i, _x, y, _w, h) => {
				const t = h > 1 ? y / (h - 1) : 0;
				const k = 3 * Math.round(255 * clamp01(t + (luma(d[i], d[i + 1], d[i + 2]) / 255 - 0.5) * 0.48));
				d[i] = GOLD[k];
				d[i + 1] = GOLD[k + 1];
				d[i + 2] = GOLD[k + 2];
			})
	},
	{
		id: 'isolate',
		category: 'color',
		label: '色抜き',
		labelEn: 'Color pop',
		description: '赤だけ残してほかを灰色にする。強調、ここだけ、印象的、映画風',
		filter: (dst, src, f) =>
			mapPixels(dst, src, f, 'fx-isolate', (d, i) => {
				const h = hue(d[i], d[i + 1], d[i + 2]);
				let diff = h < 0 ? 999 : Math.abs(h - KEEP_HUE) % 360;
				if (diff > 180) diff = 360 - diff;
				const keep = diff <= 40 ? 1 : Math.max(0, 1 - (diff - 40) / 15);
				if (keep >= 1) return;
				const g = luma(d[i], d[i + 1], d[i + 2]);
				for (let c = 0; c < 3; c++) d[i + c] = g + (d[i + c] - g) * keep;
			})
	}
];

export const moreShine: Effect[] = [
	{
		id: 'strobe',
		category: 'shine',
		label: 'ストロボ',
		labelEn: 'Strobe',
		description: 'カメラのフラッシュのように一瞬だけ白く飛ぶ。撮影、パシャ、スクープ、まぶしい',
		filter: (dst, src, f) => {
			dst.drawImage(src, 0, 0);
			const p = frac(f.t * 2);
			const width = 0.2;
			if (p >= width) return;
			dst.globalAlpha = Math.sin((p / width) * Math.PI);
			dst.globalCompositeOperation = 'source-atop';
			dst.fillStyle = '#ffffff';
			dst.fillRect(0, 0, f.w, f.h);
		}
	}
];

export const moreBreak: Effect[] = [
	{
		id: 'blur',
		category: 'break',
		label: 'ブラー',
		labelEn: 'Blur',
		description: '外へ流れるブラーが寄せては引く。ぼやける、目がかすむ、衝撃、スピード',
		filter: (dst, src, f) => {
			const pulse = 0.5 - 0.5 * Math.cos(TAU * f.t);
			const amount = 0.25 * pulse;
			let total = 0;
			for (let n = 0; n < 10; n++) {
				const a = n / 9;
				const wgt = 4 * (a - a * a) + 0.02;
				total += wgt;
				const k = 1 / (1 - a * amount);
				drawT(dst, src, f, { sx: k, sy: k, alpha: wgt / total });
			}
		}
	},
	{
		id: 'explode',
		category: 'break',
		label: '砕け散る',
		labelEn: 'Shatter',
		description: '細かい破片に砕けて飛び散り、回りながら落ちていく。粉砕、絶望、ショック、崩壊',
		filter: (dst, src, f) => {
			const size = Math.max(1, f.h * 0.03);
			const cols = Math.ceil(f.w / size);
			const rows = Math.ceil(f.h / size);
			const hold = 0.3;
			const span = 0.6;
			const p = clamp01((f.t - hold) / (1 - hold));
			const cx = f.w / 2;
			const cy = f.h / 2;
			const R = f.h / 2;
			for (let j = 0; j < rows; j++)
				for (let i = 0; i < cols; i++) {
					const x = i * size;
					const y = j * size;
					const w = Math.min(size, f.w - x);
					const h = Math.min(size, f.h - y);
					if (w <= 0 || h <= 0) continue;
					const mx = x + w / 2;
					const my = y + h / 2;
					const far = Math.min(1, Math.hypot(mx - cx, my - cy) / R);
					// 外側の破片ほど遅れて飛び出す
					const delay = 0.2 * far * span;
					const q = Math.max(0, (p - delay) / (span - delay));
					const ang = Math.atan2(my - cy, mx - cx) + (hash(i, j) - 0.5) * 0.4 * Math.PI;
					const dist = 1.05 * (0.35 + 0.78 * far) * f.h * q;
					const px = mx + Math.cos(ang) * dist;
					const py = my + Math.sin(ang) * dist + 1.3 * f.h * q * q;
					const half = Math.hypot(w, h) / 2;
					if (px + half < 0 || px - half > f.w || py + half < 0 || py - half > f.h) continue;
					const spin = (hash(i, j + 71) - 0.5) * 1.5 * TAU * q;
					dst.save();
					dst.translate(px, py);
					if (spin) dst.rotate(spin);
					dst.drawImage(src, x, y, w, h, -w / 2, -h / 2, w, h);
					dst.restore();
				}
		}
	},
	{
		id: 'mirror',
		category: 'break',
		label: '反転',
		labelEn: 'Mirror',
		description: '左右を鏡写しにする。あべこべ、逆、裏返し、鏡の国',
		transform: (_f, tr) => {
			tr.sx *= -1;
		}
	},
	{
		id: 'mosaic',
		category: 'break',
		label: 'モザイク',
		labelEn: 'Mosaic',
		description: '粗いドットに潰す。ドット絵、レトロゲーム、放送禁止、ぼかし',
		filter: (dst, src, f) => {
			const cell = Math.max(2, Math.round(8 * f.s));
			const s = scratch('fx-mosaic', Math.max(2, Math.round(f.w / cell)), Math.max(2, Math.round(f.h / cell)));
			s.ctx.imageSmoothingEnabled = true;
			s.ctx.drawImage(src, 0, 0, s.canvas.width, s.canvas.height);
			dst.imageSmoothingEnabled = false;
			dst.drawImage(s.canvas, 0, 0, f.w, f.h);
		}
	}
];

const CONFETTI = ['#ff6b6b', '#4dabf7', '#ffd43b'];

export const moreDecorate: Effect[] = [
	{
		id: 'shadow',
		category: 'decorate',
		label: '影',
		labelEn: 'Shadow',
		description: 'やわらかい落ち影をつける。立体的、浮いている、くっきり',
		filter: (dst, src, f) => {
			const a = (135 * Math.PI) / 180;
			const d = 6 * f.s;
			dst.shadowColor = 'rgba(0, 0, 0, 0.55)';
			dst.shadowBlur = 8 * f.s;
			dst.shadowOffsetX = Math.cos(a) * d;
			dst.shadowOffsetY = Math.sin(a) * d;
			dst.drawImage(src, 0, 0);
		}
	},
	{
		id: 'shadow-spin',
		category: 'decorate',
		label: '影ぐるぐる',
		labelEn: 'Orbit shadow',
		description: '影だけが本体のまわりをぐるぐる回る。不思議、目が回る、サイケ、催眠',
		filter: (dst, src, f) => {
			const d = 0.05 * f.h;
			const a = TAU * f.t;
			dst.save();
			dst.shadowColor = '#111827';
			dst.shadowOffsetX = Math.sin(a) * d;
			dst.shadowOffsetY = Math.cos(a) * d;
			dst.drawImage(src, 0, 0);
			dst.restore();
			dst.drawImage(src, 0, 0);
		}
	},
	{
		id: 'confetti',
		category: 'decorate',
		label: '紙吹雪',
		labelEn: 'Confetti',
		description: '小さな紙片が背景にひらひら落ちてくる。おめでとう、お祝い、祝賀、優勝',
		under: (ctx, f) => {
			const n = Math.round(12 * Math.max(1, f.w / f.h));
			const size = Math.max(3, 12 * f.s);
			const thick = 0.68 * size;
			for (let i = 0; i < n; i++) {
				const y = -2 * thick + frac(f.t + hash(i, 21)) * (f.h + 4 * thick);
				const sway = 1 + Math.floor(2 * hash(i, 33));
				const x = f.w * (0.04 + 0.92 * hash(i, 27)) + 1.1 * size * Math.sin(TAU * sway * f.t + hash(i, 39) * TAU);
				const turn = 1 + Math.floor(3 * hash(i, 45));
				const flip = Math.abs(Math.cos(TAU * turn * f.t + hash(i, 51) * TAU));
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(0.35 * Math.sin(TAU * sway * f.t + hash(i, 57) * TAU));
				ctx.fillStyle = CONFETTI[i % CONFETTI.length];
				ctx.fillRect(-size / 2, (-thick / 2) * flip, size, Math.max(0.8, thick * flip));
				ctx.restore();
			}
		}
	},
	{
		id: 'psyche',
		category: 'decorate',
		label: 'サイケ',
		labelEn: 'Psyche',
		description: '放射状の模様が背景でぐるぐる回る。サイケ、トリップ、混乱、派手',
		under: (ctx, f) => {
			const n = 12;
			const rot = f.t * TAU;
			const r = Math.hypot(f.w, f.h);
			ctx.fillStyle = '#ffd166';
			ctx.fillRect(0, 0, f.w, f.h);
			ctx.fillStyle = '#ff4d6d';
			for (let i = 0; i < n; i += 2) {
				ctx.beginPath();
				ctx.moveTo(f.w / 2, f.h / 2);
				ctx.arc(f.w / 2, f.h / 2, r, rot + (i / n) * TAU, rot + ((i + 1) / n) * TAU);
				ctx.closePath();
				ctx.fill();
			}
		}
	},
	{
		id: 'noise',
		category: 'decorate',
		label: 'チリチリ',
		labelEn: 'Static',
		description: '背景にざらざらした粒が走る。砂嵐、ノイズ、電波が悪い、テレビ',
		under: (ctx, f) => {
			const cell = Math.max(2, Math.round(4 * f.s));
			const cols = Math.ceil(f.w / cell);
			const rows = Math.ceil(f.h / cell);
			const seed = Math.floor(10 * f.t) % 10;
			ctx.fillStyle = '#94a3b8';
			for (let y = 0; y < rows; y++)
				for (let x = 0; x < cols; x++) if (hash(x + 131 * y, seed) < 0.25) ctx.fillRect(x * cell, y * cell, cell, cell);
		}
	}
];
