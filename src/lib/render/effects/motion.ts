/** 動かす・登場させるエフェクト（追加分）。 */
import { TAU, clamp01, easeOutCubic, type Box, type Ctx2D, type Effect, type Frame, type Surface } from './types';
import { alphaBox, drawAt, drawT, easeInOut, frac, ramp, scratch } from './util';

const DEG = Math.PI / 180;

/** 1文字ずつの区画。画像から作るときは全体を1つの区画として扱う。 */
const cellsOf = (f: Frame): Box[] => (f.glyphs.length ? f.glyphs : [{ x0: 0, y0: 0, x1: f.w, y1: f.h }]);

/** src を区画で切り抜いて描く。 */
function drawCell(ctx: Ctx2D, src: Surface, cell: Box, clip?: { y0: number; y1: number }) {
	const y0 = Math.max(cell.y0, clip?.y0 ?? -Infinity);
	const y1 = Math.min(cell.y1, clip?.y1 ?? Infinity);
	const w = cell.x1 - cell.x0;
	const h = y1 - y0;
	if (w <= 0 || h <= 0) return;
	ctx.drawImage(src, cell.x0, y0, w, h, cell.x0, y0, w, h);
}

/** 区画の中で字が実際にある上下の範囲。区画の下端は行間の真ん中なので、字の下端に寄せる。 */
function inkRange(cell: Box, ink: Box | null) {
	if (!ink) return { y0: cell.y0, y1: cell.y1 };
	const y0 = Math.max(cell.y0, ink.y0);
	const y1 = Math.min(cell.y1, ink.y1);
	return y0 < y1 ? { y0, y1 } : { y0: cell.y0, y1: cell.y1 };
}

/* 残像ダッシュの横位置（幅に対する割合）。溜めて右へ抜け、左から滑り込む。 */
function dashX(t: number) {
	const p = frac(t);
	const back = -0.07 * easeInOut(ramp(p, 0.34, 0.48));
	if (p < 0.48) return back;
	if (p < 0.6) {
		const e = ramp(p, 0.48, 0.6);
		return -0.07 + 1.37 * e * e * e;
	}
	if (p < 0.63) return 1.3;
	if (p < 0.82) return -1.3 + 1.34 * easeOutCubic(ramp(p, 0.63, 0.82));
	return 0.04 * (1 - easeInOut(ramp(p, 0.82, 0.94)));
}
const GHOSTS = [
	{ lag: 0.02, every: 2 },
	{ lag: 0.04, every: 4 },
	{ lag: 0.06, every: 8 }
];

/* よいしょ: しゃがむ → 跳ぶ → 着地で潰れる → 戻る */
function hopPose(p: number) {
	if (p < 0.22) {
		const k = easeInOut(ramp(p, 0, 0.22));
		return { dy: 0, sx: 1 + 0.08 * k, sy: 1 - 0.14 * k };
	}
	if (p < 0.56) {
		const k = ramp(p, 0.22, 0.56);
		const arc = 4 * k * (1 - k);
		if (k < 0.12) {
			const e = easeOutCubic(k / 0.12);
			return { dy: -0.2 * arc, sx: 1.08 - 0.15 * e, sy: 0.86 + 0.26 * e };
		}
		const r = Math.max(0, 1 - (k - 0.12) * 2.5);
		return { dy: -0.2 * arc, sx: 1 - 0.07 * r, sy: 1 + 0.12 * r };
	}
	if (p < 0.62) {
		const k = easeOutCubic(ramp(p, 0.56, 0.62));
		return { dy: 0, sx: 1 + 0.16 * k, sy: 1 - 0.26 * k };
	}
	if (p < 0.7) return { dy: 0, sx: 1.16, sy: 0.74 };
	const k = easeInOut(ramp(p, 0.7, 1));
	const wob = 0.05 * Math.sin(k * Math.PI);
	return { dy: 0, sx: 1.16 - 0.16 * k - 0.5 * wob, sy: 0.74 + 0.26 * k + wob };
}

const GUFFAW_AMP = [1, 0.62, 0.9, 0.58];

export const moreMove: Effect[] = [
	{
		id: 'slide',
		category: 'move',
		label: 'スライド',
		labelEn: 'Slide',
		description: '横にゆったり往復する。行ったり来たり、そわそわ、様子見',
		transform: (f, tr) => {
			tr.dx += 0.12 * f.h * Math.sin(f.t * TAU);
		}
	},
	{
		id: 'orbit',
		category: 'move',
		label: 'ねるねる',
		labelEn: 'Orbit',
		description: '傾かずに位置だけが円を描いて回る。ねるねる、まぜまぜ、ふわふわ',
		transform: (f, tr) => {
			const r = 0.1 * f.h;
			tr.dx += Math.cos(f.t * TAU) * r;
			tr.dy += Math.sin(f.t * TAU) * r;
		}
	},
	{
		id: 'yatta',
		category: 'move',
		label: 'やったー',
		labelEn: 'Yatta',
		description: '跳ねながら左右に傾く。やったー、うれしい、はしゃぐ、喜ぶ',
		transform: (f, tr) => {
			tr.dy += 0.125 * f.h * Math.sin(TAU * 4 * f.t);
			tr.rot += 6 * DEG * (frac(f.t) >= 0.5 ? -1 : 1);
		}
	},
	{
		id: 'mochi',
		category: 'move',
		label: 'もちもち',
		labelEn: 'Mochi',
		description: '縦横に伸び縮みする。もちもち、やわらかい、ぷにぷに、かわいい',
		filter: (dst, src, f) => {
			const d = f.t * TAU * 2;
			const u = 1 + 0.176 * ((Math.sin(d) + 0.18 * Math.sin(2 * d + 0.6)) / 1.18);
			drawT(dst, src, f, { sx: u, sy: 1 / u, oy: 0.95 });
		}
	},
	{
		id: 'flip',
		category: 'move',
		label: 'ぱたぱた',
		labelEn: 'Flip',
		description: '紙がめくれるように左右に反転し続ける。ぱたぱた、裏返る、迷う',
		transform: (f, tr) => {
			const c = Math.cos(f.t * TAU);
			tr.sx *= (c < 0 ? -1 : 1) * Math.max(Math.abs(c), 0.01);
		}
	},
	{
		id: 'audience',
		category: 'move',
		label: '謁見',
		labelEn: 'Audience',
		description: '左右に割れて開き、奥から同じ絵が現れる。ははーっ、ご開帳、登場',
		filter: (dst, src, f) => {
			const o = frac(f.t);
			const half = f.w / 2;
			drawT(dst, src, f, { sx: o, sy: o });
			dst.drawImage(src, 0, 0, half, f.h, -o * half, 0, half, f.h);
			dst.drawImage(src, half, 0, half, f.h, half + o * half, 0, half, f.h);
		}
	},
	{
		id: 'guffaw',
		category: 'move',
		label: 'ゲラゲラ',
		labelEn: 'Guffaw',
		description: '笑うように上下に跳ね続ける。爆笑、草、ウケる、ゲラゲラ',
		filter: (dst, src, f) => {
			const box = alphaBox(src, f);
			const beat = Math.floor(4 * frac(f.t)) % 4;
			const r = frac(4 * f.t);
			let ty = 0;
			let sx = 1;
			let sy = 1;
			let rot = 0;
			if (r < 0.68) {
				const e = Math.sin((Math.PI * r) / 0.68);
				ty = -0.075 * f.h * GUFFAW_AMP[beat] * e;
				sy = 1 + 0.03 * e;
				sx = 1 - 0.015 * e;
				rot = (beat % 2 === 0 ? 1 : -1) * 3 * DEG * e;
			} else {
				const e = Math.sin((Math.PI * (r - 0.68)) / 0.32);
				sy = 1 - 0.07 * e;
				sx = 1 + 0.04 * e;
			}
			const cx = box ? (box.x0 + box.x1) / 2 : f.w / 2;
			const cy = box ? box.y1 : f.h;
			drawAt(dst, src, cx, cy, { ty, sx, sy, rot });
		}
	},
	{
		id: 'hop',
		category: 'move',
		label: 'よいしょ',
		labelEn: 'Hop',
		description: '1文字ずつしゃがんで溜め、ぴょんと跳んで着地でむぎゅっと潰れる。よいしょ、がんばる',
		filter: (dst, src, f) => {
			const cells = cellsOf(f);
			const ink = alphaBox(src, f);
			const lag = Math.min(0.06, 0.16 / Math.max(1, cells.length - 1));
			cells.forEach((cell, i) => {
				const u = 0.04 + i * lag;
				const pose = hopPose(ramp(frac(f.t), u, u + 0.76));
				const cx = (cell.x0 + cell.x1) / 2;
				const cy = inkRange(cell, ink).y1;
				dst.save();
				dst.translate(cx, cy + pose.dy * f.h);
				dst.scale(pose.sx, pose.sy);
				dst.translate(-cx, -cy);
				drawCell(dst, src, cell);
				dst.restore();
			});
		}
	},
	{
		id: 'straight',
		category: 'move',
		label: '直球',
		labelEn: 'Fastball',
		description: '奥から手前へまっすぐ迫ってくる。直球、ストレート、迫る、本気',
		transform: (f, tr) => {
			const p = frac(f.t);
			const hold = 0.2;
			const k = p < hold ? 1 : p < 1 - hold ? (p - hold) / (1 - 2 * hold) : 1;
			tr.sx *= k;
			tr.sy *= k;
		}
	},
	{
		id: 'roulette',
		category: 'move',
		label: 'ルーレット',
		labelEn: 'Roulette',
		description: '高速で上へ流れて、だんだん遅くなって止まる。抽選、ガチャ、運命、どれにしよう',
		filter: (dst, src, f) => {
			const d = 1 - Math.pow(1 - Math.min(1, f.t / 0.65), 4);
			const y = (((-d * 2 * f.h) % f.h) + f.h) % f.h;
			dst.drawImage(src, 0, y);
			dst.drawImage(src, 0, y - f.h);
		}
	},
	{
		id: 'zoom',
		category: 'move',
		label: 'ズーム',
		labelEn: 'Zoom',
		description: '呼吸するように寄って引く。注目、ぐいっと、迫る、ふくらむ',
		transform: (f, tr) => {
			const k = 0.7 + 0.65 * ((Math.sin(f.t * TAU) + 1) / 2);
			tr.sx *= k;
			tr.sy *= k;
		}
	},
	{
		id: 'dash',
		category: 'move',
		label: '残像ダッシュ',
		labelEn: 'Dash',
		description: '右へシュッと抜けて左から滑り込む。横縞の残像が尾を引く。至急、今行きます',
		filter: (dst, src, f) => {
			const now = dashX(f.t);
			const ghost = scratch('dash-ghost', f.w, f.h);
			const line = Math.max(1, Math.round(f.s));
			for (let i = GHOSTS.length - 1; i >= 0; i--) {
				const g = GHOSTS[i];
				const was = dashX(f.t - g.lag);
				if (Math.abs(was - now) < 0.06) continue;
				ghost.ctx.clearRect(0, 0, f.w, f.h);
				ghost.ctx.globalCompositeOperation = 'source-over';
				ghost.ctx.drawImage(src, was * f.w, 0);
				ghost.ctx.globalCompositeOperation = 'destination-in';
				ghost.ctx.beginPath();
				for (let y = 0; y < f.h; y += line * g.every) ghost.ctx.rect(0, y, f.w, line);
				ghost.ctx.fill();
				ghost.ctx.globalCompositeOperation = 'source-over';
				// 残像は本体より後ろ（左）にだけ残す
				const until = Math.max(0, Math.min(f.w, Math.round(now * f.w)));
				if (until > 0.1 * f.w) dst.drawImage(ghost.canvas, 0, 0, until, f.h, 0, 0, until, f.h);
			}
			dst.drawImage(src, now * f.w, 0);
		}
	}
];

export const moreAppear: Effect[] = [
	{
		id: 'stamp',
		category: 'appear',
		label: 'ドンッ',
		labelEn: 'Stamp',
		description: '大きく構えてドンッと押し込み、揺れて止まる。決定、ハンコ、承認、ドーン',
		filter: (dst, src, f) => {
			const hit = 0.3;
			const from = 2.4;
			if (f.t < hit) {
				const p = f.t / hit;
				const k = p * (0.25 + 0.75 * p);
				const s = from + (1 - from) * k;
				drawT(dst, src, f, { sx: s, sy: s, alpha: 0.3 + 0.7 * k });
				return;
			}
			const p = (f.t - hit) / (1 - hit);
			const decay = Math.exp(-6 * p);
			const w = 2.5 * TAU;
			const sq = 0.12 * decay * Math.sin(p * w);
			const amp = 0.05 * f.h * 0.45;
			drawT(dst, src, f, {
				tx: amp * decay * Math.sin(p * w * 1.6),
				ty: amp * decay * Math.sin(p * w * 1.3 + 0.4) * 0.6,
				sx: 1 + sq,
				sy: 1 - sq,
				oy: 0.95
			});
		}
	},
	{
		id: 'rise',
		category: 'appear',
		label: '起き上がる',
		labelEn: 'Rise',
		description: '後ろへ倒れていて、勢いよく起き上がって止まる。復活、立ち直る、起床',
		filter: (dst, src, f) => {
			const end = 0.7;
			const max = Math.PI / 2;
			let ang = 0;
			if (f.t < end) {
				const p = f.t / end;
				if (p < 0.12) ang = max;
				else {
					const k = (p - 0.12) / 0.88;
					ang = max * (1 - k * k);
					if (k > 0.85) ang -= 0.07 * max * Math.sin((Math.PI * (k - 0.85)) / 0.15);
				}
			}
			if (Math.abs(ang) < 0.002) {
				dst.drawImage(src, 0, 0);
				return;
			}
			// 下端を軸に奥へ倒れた板を、上ほど小さく見える帯の重なりで描く
			const lean = Math.sin(ang);
			const tall = Math.max(0, Math.cos(ang)) * f.h;
			if (tall <= 1) return;
			const top = f.h - tall;
			const near = 1.8 / (1.8 + lean);
			const warp = (e: number) => e / (near + e * (1 - near));
			const N = 32;
			for (let i = 0; i < N; i++) {
				const a = i / N;
				const b = (i + 1) / N;
				const sy = warp(a) * f.h;
				const sh = (warp(b) - warp(a)) * f.h;
				const width = (near + a * (1 - near)) * f.w;
				if (sh <= 0 || width <= 0) continue;
				dst.drawImage(src, 0, sy, f.w, sh, (f.w - width) / 2, top + a * tall, width, (b - a) * tall + 0.5);
			}
		}
	},
	{
		id: 'typewriter',
		category: 'appear',
		label: 'タイプライター',
		labelEn: 'Typewriter',
		description: '文字が1文字ずつ出てくる。入力中、カタカタ、メッセージ、つぶやき',
		filter: (dst, src, f) => {
			const end = 0.6;
			const cells = cellsOf(f);
			if (f.t >= end || cells.length <= 1) {
				// 画像や1文字だけのときは、出そろうまで左からめくる
				if (cells.length <= 1 && f.t < end) {
					const w = Math.max(1, f.w * (f.t / end));
					dst.drawImage(src, 0, 0, w, f.h, 0, 0, w, f.h);
				} else dst.drawImage(src, 0, 0);
				return;
			}
			const shown = (f.t / end) * cells.length;
			cells.forEach((c, i) => {
				if (shown - i > 0) drawCell(dst, src, c);
			});
		}
	},
	{
		id: 'print',
		category: 'appear',
		label: '印刷',
		labelEn: 'Print',
		description: '印字ヘッドが往復して1行ずつ刷っていく。印刷中、作成中、出力',
		filter: (dst, src, f) => {
			const box = alphaBox(src, f) ?? { x0: 0, y0: 0, x1: f.w, y1: f.h };
			const band = 0.085 * f.h;
			const rows = Math.max(1, Math.ceil((box.y1 - box.y0) / band));
			const prog = ramp(f.t, 0.06, 0.72) * rows;
			const row = Math.min(rows - 1, Math.floor(prog));
			const done = prog >= rows;
			const along = easeInOut(done ? 1 : prog - row);
			const ltr = row % 2 === 0;
			const head = done ? (ltr ? box.x1 : box.x0) : ltr ? box.x0 + (box.x1 - box.x0) * along : box.x1 - (box.x1 - box.x0) * along;
			const y = box.y0 + row * band;
			dst.save();
			dst.beginPath();
			if (done) dst.rect(0, 0, f.w, f.h);
			else {
				dst.rect(0, 0, f.w, y);
				if (ltr) dst.rect(0, y, head, band);
				else dst.rect(head, y, f.w - head, band);
			}
			dst.clip();
			dst.drawImage(src, 0, 0);
			dst.restore();
			// ヘッドとレール
			const away = easeInOut(ramp(f.t, 0.72, 0.82));
			if (f.t < 0.03 || away >= 1) return;
			const enter = easeInOut(ramp(f.t, 0, 0.06));
			const hy = Math.min(y + band, box.y1);
			const hx = head + (f.w + 0.2 * f.h - head) * away - (1 - enter) * f.h * 0.3;
			const hw = 0.1 * f.h;
			const hh = 0.06 * f.h;
			dst.fillStyle = '#7b818b';
			const r0 = Math.min(box.x0, hx - hw / 2);
			const r1 = Math.max(box.x1, hx + hw / 2);
			dst.fillRect(r0, hy - 0.006 * f.h, r1 - r0, 0.012 * f.h);
			dst.beginPath();
			dst.roundRect(hx - hw / 2, hy - hh / 2, hw, hh, 0.012 * f.h);
			dst.fill();
		}
	},
	{
		id: 'stack',
		category: 'appear',
		label: '積み上げ',
		labelEn: 'Stack',
		description: '字を3段に切った積み木が、下から順に落ちてきて積み上がる。完成、リリース、積み重ね',
		filter: (dst, src, f) => {
			const t = clamp01(f.t);
			const cells = cellsOf(f);
			const ink = alphaBox(src, f);
			const parts: { cell: Box; y0: number; y1: number; order: number }[] = [];
			for (let level = 0; level < 3; level++)
				cells.forEach((cell, i) => {
					const r = inkRange(cell, ink);
					const step = (r.y1 - r.y0) / 3;
					const lo = Math.round(r.y1 - step * level);
					const hi = Math.round(r.y1 - step * (level + 1));
					parts.push({
						cell,
						y0: level === 2 ? -Infinity : hi,
						y1: level === 0 ? Infinity : lo,
						order: level * cells.length + i
					});
				});
			const n = parts.length;
			const gap = 0.33 / Math.max(1, n - 1);
			const last = 0.04 + gap * (n - 1) + 0.13;
			const thud = t > last && t < last + 0.08 ? Math.sin(ramp(t, last, last + 0.08) * Math.PI) * f.h * 0.015 : 0;
			for (const part of parts) {
				const start = 0.04 + gap * part.order;
				const p = ramp(t, start, start + 0.13);
				if (p <= 0) continue;
				let dy: number;
				if (p < 0.78) {
					const e = p / 0.78;
					dy = -(1 - e * e) * f.h * 1.1;
				} else dy = -Math.sin(((p - 0.78) / 0.22) * Math.PI) * f.h * 0.025;
				dst.save();
				dst.translate(0, dy + thud);
				drawCell(dst, src, part.cell, part);
				dst.restore();
			}
		}
	}
];

