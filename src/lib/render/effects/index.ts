import {
	TAU,
	clamp01,
	easeOutBack,
	easeOutBounce,
	easeOutCubic,
	rng,
	type Ctx2D,
	type Effect,
	type Frame
} from './types';

export * from './types';

/* ---------- 動かす ---------- */
const move: Effect[] = [
	{
		id: 'shiver',
		category: 'move',
		label: 'ぷるぷる',
		labelEn: 'Shiver',
		description: '小刻みに震える。寒い、怖い、緊張、こらえている、感動で震える',
		transform: (f, tr) => {
			tr.dx += Math.sin(f.t * TAU * 10) * f.h * 0.025;
			tr.dy += Math.cos(f.t * TAU * 7) * f.h * 0.012;
		}
	},
	{
		id: 'sway',
		category: 'move',
		label: 'ゆらゆら',
		labelEn: 'Sway',
		description: '左右にゆっくり揺れる。のんびり、ほのぼの、眠い、ゆるい気分',
		transform: (f, tr) => {
			tr.rot += Math.sin(f.t * TAU) * 0.16;
		}
	},
	{
		id: 'bounce',
		category: 'move',
		label: 'ぽよん',
		labelEn: 'Bounce',
		description: '弾むように跳ねる。うれしい、元気、楽しい、はずむ気持ち',
		transform: (f, tr) => {
			const up = Math.abs(Math.sin(f.t * TAU));
			const ground = Math.pow(1 - up, 6);
			tr.dy -= up * f.h * 0.16;
			tr.sx *= 1 + 0.14 * ground;
			tr.sy *= 1 - 0.14 * ground;
			tr.dy += f.h * 0.5 * 0.14 * ground;
		}
	},
	{
		id: 'spin',
		category: 'move',
		label: 'ぐるぐる',
		labelEn: 'Spin',
		description: '一回転する。混乱、目が回る、考え中、ぐるぐる悩む',
		transform: (f, tr) => {
			tr.rot += easeInOut(f.t) * TAU;
		}
	},
	{
		id: 'groove',
		category: 'move',
		label: 'ノリノリ',
		labelEn: 'Groove',
		description: 'リズムに乗って左右に傾く。音楽、ダンス、テンションが高い、ノリがいい',
		transform: (f, tr) => {
			const beat = f.t * 2;
			tr.rot += Math.sin(beat * TAU) * 0.14;
			tr.sy *= 1 + 0.07 * Math.abs(Math.cos(beat * TAU));
			tr.dy -= Math.abs(Math.cos(beat * TAU)) * f.h * 0.04;
		}
	},
	{
		id: 'heartbeat',
		category: 'move',
		label: 'どきどき',
		labelEn: 'Heartbeat',
		description: '鼓動のように二回ずつ大きくなる。好き、ときめき、緊張、どきどきする',
		transform: (f, tr) => {
			const pulse = (x: number) => Math.exp(-Math.pow((x % 1) * 9, 2));
			const k = 1 + 0.12 * pulse(f.t) + 0.08 * pulse((f.t + 0.82) % 1);
			tr.sx *= k;
			tr.sy *= k;
		}
	},
	{
		id: 'flow',
		category: 'move',
		label: 'ながれる',
		labelEn: 'Scroll',
		description: '右から左へ流れ続ける。電光掲示板、お知らせ、速報、流れていく',
		filter: (dst, src, f) => {
			const x = -f.t * f.w;
			dst.drawImage(src, x, 0);
			dst.drawImage(src, x + f.w, 0);
		}
	}
];

function easeInOut(x: number) {
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/* ---------- 登場 ---------- */
const appear: Effect[] = [
	{
		id: 'zoomin',
		category: 'appear',
		label: 'ズーム',
		labelEn: 'Zoom in',
		description: '小さい状態から勢いよく大きくなって現れる。登場、ドーン、強調、発表',
		transform: (f, tr) => {
			const k = easeOutBack(clamp01(f.t / 0.35));
			tr.sx *= k;
			tr.sy *= k;
		}
	},
	{
		id: 'fadein',
		category: 'appear',
		label: 'ふわっと',
		labelEn: 'Float in',
		description: '下からふわりと浮かび上がって現れる。やさしい、静か、おだやか',
		transform: (f, tr) => {
			const k = easeOutCubic(clamp01(f.t / 0.45));
			tr.alpha *= k;
			tr.dy += (1 - k) * f.h * 0.18;
		}
	},
	{
		id: 'drop',
		category: 'appear',
		label: 'ドスン',
		labelEn: 'Drop',
		description: '上から落ちてきて弾む。重大、決定、着地、どっしり',
		transform: (f, tr) => {
			const k = easeOutBounce(clamp01(f.t / 0.5));
			tr.dy -= (1 - k) * f.h * 1.1;
		}
	},
	{
		id: 'reveal',
		category: 'appear',
		label: 'じわっと',
		labelEn: 'Reveal',
		description: '左から順に文字が現れる。読み上げ、タイピング、じわじわ来る',
		filter: (dst, src, f) => {
			const k = easeOutCubic(clamp01(f.t / 0.55));
			const w = Math.max(1, Math.round(f.w * k));
			dst.drawImage(src, 0, 0, w, f.h, 0, 0, w, f.h);
		}
	}
];

/* ---------- 色 ---------- */
const color: Effect[] = [
	{
		id: 'rainbow',
		category: 'color',
		label: 'にじいろ',
		labelEn: 'Rainbow',
		description: '虹色が流れる。お祝い、最高、ハッピー、華やか、パーティー',
		paint: (ctx, f) => {
			const span = f.w * 1.5;
			const off = -f.t * span;
			const g = ctx.createLinearGradient(off, 0, off + span * 2, f.h * 0.4);
			const hues = [0, 45, 120, 200, 270, 330, 360];
			for (let rep = 0; rep < 2; rep++)
				hues.forEach((hue, i) => g.addColorStop((rep + i / (hues.length - 1)) / 2, `hsl(${hue} 95% 60%)`));
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, f.w, f.h);
		}
	},
	{
		id: 'hue',
		category: 'color',
		label: 'いろがわり',
		labelEn: 'Hue shift',
		description: '色が順番に変わっていく。カラフル、気分が変わる、にぎやか',
		paint: (ctx, f) => {
			ctx.fillStyle = `hsl(${Math.round(f.t * 360)} 90% 58%)`;
			ctx.fillRect(0, 0, f.w, f.h);
		}
	},
	{
		id: 'blink',
		category: 'color',
		label: 'ちかちか',
		labelEn: 'Blink',
		description: '色が点滅する。注意、警告、緊急、目立たせたい',
		paint: (ctx, f) => {
			if (Math.floor(f.t * 8) % 2 === 0) return;
			ctx.fillStyle = '#ffd21f';
			ctx.fillRect(0, 0, f.w, f.h);
		}
	}
];

/* ---------- 光 ---------- */
const shine: Effect[] = [
	{
		id: 'glint',
		category: 'shine',
		label: 'きらり',
		labelEn: 'Glint',
		description: '光の筋が斜めに通り抜ける。新品、ぴかぴか、かっこいい、決めポーズ',
		paint: (ctx, f) => {
			const p = clamp01(f.t / 0.6);
			if (p >= 1) return;
			const x = -f.h + p * (f.w + f.h * 2);
			const g = ctx.createLinearGradient(x - f.h * 0.3, 0, x + f.h * 0.3, f.h * 0.4);
			g.addColorStop(0, 'rgba(255,255,255,0)');
			g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
			g.addColorStop(1, 'rgba(255,255,255,0)');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, f.w, f.h);
		}
	},
	{
		id: 'neon',
		category: 'shine',
		label: 'ネオン',
		labelEn: 'Neon',
		description: '文字のまわりがぼんやり光って明滅する。夜、ネオン、おしゃれ、エモい',
		filter: (dst, src, f) => {
			const k = 0.75 + 0.25 * Math.sin(f.t * TAU * 2);
			dst.save();
			dst.shadowColor = f.color;
			dst.shadowBlur = f.h * 0.12 * k;
			dst.drawImage(src, 0, 0);
			dst.drawImage(src, 0, 0);
			dst.restore();
		}
	},
	{
		id: 'halo',
		category: 'shine',
		label: '後光',
		labelEn: 'Halo',
		description: '背後から光がさして回る。ありがたい、尊い、神、感謝、拝む',
		under: (ctx, f) => rays(ctx, f, 12, f.t * (TAU / 12), 'rgba(255, 214, 64, 0.55)', 0)
	}
];

function rays(ctx: Ctx2D, f: Frame, n: number, offset: number, fill: string, jitterSeed: number) {
	const cx = f.w / 2;
	const cy = f.h / 2;
	const r = Math.hypot(f.w, f.h);
	const rand = rng(jitterSeed);
	ctx.save();
	ctx.fillStyle = fill;
	for (let i = 0; i < n; i++) {
		const a = offset + (i / n) * TAU + (jitterSeed ? (rand() - 0.5) * 0.3 : 0);
		const half = jitterSeed ? 0.02 + rand() * 0.03 : TAU / n / 4;
		const inner = jitterSeed ? f.h * (0.32 + rand() * 0.12) : 0;
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
		ctx.lineTo(cx + Math.cos(a - half) * r, cy + Math.sin(a - half) * r);
		ctx.lineTo(cx + Math.cos(a + half) * r, cy + Math.sin(a + half) * r);
		ctx.closePath();
		ctx.fill();
	}
	ctx.restore();
}

/* ---------- 崩す ---------- */
const breakFx: Effect[] = [
	{
		id: 'glitch',
		category: 'break',
		label: 'グリッチ',
		labelEn: 'Glitch',
		description: '画面がノイズで乱れてずれる。バグ、エラー、壊れた、動揺、ハッキング',
		filter: (dst, src, f) => {
			const step = Math.floor(f.t * 12);
			const rand = rng(step * 977 + 13);
			if (rand() < 0.45) {
				dst.drawImage(src, 0, 0);
				return;
			}
			const bands = 5 + Math.floor(rand() * 4);
			let y = 0;
			for (let i = 0; i < bands; i++) {
				const bh = i === bands - 1 ? f.h - y : Math.max(1, Math.round((f.h / bands) * (0.5 + rand())));
				const dx = (rand() - 0.5) * f.h * 0.22;
				if (bh > 0) dst.drawImage(src, 0, y, f.w, bh, dx, y, f.w, bh);
				y += bh;
				if (y >= f.h) break;
			}
		}
	},
	{
		id: 'afterimage',
		category: 'break',
		label: '残像',
		labelEn: 'Afterimage',
		description: '左右に残像が出る。速い、ダッシュ、分身、急いでいる',
		filter: (dst, src, f) => {
			const off = Math.sin(f.t * TAU) * f.h * 0.12;
			dst.save();
			dst.globalAlpha = 0.22;
			dst.drawImage(src, -off * 2, 0);
			dst.globalAlpha = 0.4;
			dst.drawImage(src, -off, 0);
			dst.restore();
			dst.drawImage(src, off * 0.3, 0);
		}
	},
	{
		id: 'wave',
		category: 'break',
		label: 'ぐにゃぐにゃ',
		labelEn: 'Wobble',
		description: '波打つようにゆがむ。めまい、溶ける、酔った、ふにゃふにゃ',
		filter: (dst, src, f) => {
			const row = Math.max(1, Math.round(f.s * 2));
			for (let y = 0; y < f.h; y += row) {
				const dx = Math.sin((y / f.h) * TAU * 1.2 + f.t * TAU) * f.h * 0.06;
				dst.drawImage(src, 0, y, f.w, row, dx, y, f.w, row);
			}
		}
	}
];

/* ---------- 飾る ---------- */
function star(ctx: Ctx2D, x: number, y: number, r: number) {
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * TAU - Math.PI / 2;
		const rr = i % 2 === 0 ? r : r * 0.28;
		ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
	}
	ctx.closePath();
	ctx.fill();
}

function heart(ctx: Ctx2D, x: number, y: number, size: number) {
	ctx.beginPath();
	ctx.moveTo(x, y + size * 0.35);
	ctx.bezierCurveTo(x - size, y - size * 0.35, x - size * 0.35, y - size, x, y - size * 0.4);
	ctx.bezierCurveTo(x + size * 0.35, y - size, x + size, y - size * 0.35, x, y + size * 0.35);
	ctx.fill();
}

function drop(ctx: Ctx2D, x: number, y: number, size: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - size);
	ctx.bezierCurveTo(x + size * 0.7, y - size * 0.1, x + size * 0.6, y + size * 0.6, x, y + size * 0.6);
	ctx.bezierCurveTo(x - size * 0.6, y + size * 0.6, x - size * 0.7, y - size * 0.1, x, y - size);
	ctx.fill();
}

const decorate: Effect[] = [
	{
		id: 'sparkle',
		category: 'decorate',
		label: 'キラキラ',
		labelEn: 'Sparkle',
		description: '周りに星がきらめく。すごい、素敵、かわいい、輝いている、うれしい',
		over: (ctx, f) => {
			const rand = rng(7);
			const n = 4 + Math.round(f.w / f.h);
			ctx.save();
			ctx.fillStyle = '#fff6c2';
			for (let i = 0; i < n; i++) {
				const x = rand() * f.w;
				const y = rand() * f.h;
				const phase = rand();
				const k = Math.max(0, Math.sin((f.t + phase) * TAU));
				star(ctx, x, y, f.h * 0.09 * k);
			}
			ctx.restore();
		}
	},
	{
		id: 'focus',
		category: 'decorate',
		label: '集中線',
		labelEn: 'Speed lines',
		description: '背景に集中線が走る。衝撃、驚き、ドン、注目、迫力',
		under: (ctx, f) => rays(ctx, f, 36, 0, 'rgba(160, 172, 190, 0.75)', Math.floor(f.t * 8) + 1)
	},
	{
		id: 'sweat',
		category: 'decorate',
		label: '汗',
		labelEn: 'Sweat',
		description: '汗のしずくが垂れる。焦り、困った、気まずい、苦笑い、ぎくっ',
		over: (ctx, f) => {
			ctx.save();
			ctx.fillStyle = '#5ab8ff';
			const fall = (f.t % 1) * f.h * 0.12;
			drop(ctx, f.w - f.h * 0.14, f.h * 0.2 + fall, f.h * 0.1);
			drop(ctx, f.w - f.h * 0.3, f.h * 0.1 + fall * 0.6, f.h * 0.065);
			ctx.restore();
		}
	},
	{
		id: 'hearts',
		category: 'decorate',
		label: 'ハート',
		labelEn: 'Hearts',
		description: 'ハートがふわふわ昇っていく。好き、愛、ありがとう、かわいい、推し',
		over: (ctx, f) => {
			const rand = rng(31);
			const n = 3 + Math.round(f.w / f.h);
			ctx.save();
			for (let i = 0; i < n; i++) {
				const x = (0.1 + 0.8 * rand()) * f.w;
				const phase = (f.t + i / n) % 1;
				const y = f.h * (1.1 - phase * 1.3);
				ctx.globalAlpha = Math.sin(phase * Math.PI);
				ctx.fillStyle = i % 2 ? '#ff5fa8' : '#ff8fc4';
				heart(ctx, x + Math.sin(phase * TAU) * f.h * 0.05, y, f.h * 0.12);
			}
			ctx.restore();
		}
	},
	{
		id: 'anger',
		category: 'decorate',
		label: 'むかっ',
		labelEn: 'Anger',
		description: '怒りマークが脈打つ。怒り、イライラ、むかつく、ぷんぷん',
		over: (ctx, f) => {
			const k = 1 + 0.18 * Math.abs(Math.sin(f.t * TAU * 2));
			const r = f.h * 0.12 * k;
			const cx = f.w - f.h * 0.18;
			const cy = f.h * 0.18;
			ctx.save();
			ctx.strokeStyle = '#ff3b3b';
			ctx.lineWidth = r * 0.32;
			ctx.lineCap = 'round';
			for (let i = 0; i < 4; i++) {
				const a = (i / 4) * TAU + Math.PI / 4;
				const ax = cx + Math.cos(a) * r;
				const ay = cy + Math.sin(a) * r;
				ctx.beginPath();
				ctx.moveTo(ax + Math.cos(a + Math.PI / 2) * r * 0.55, ay + Math.sin(a + Math.PI / 2) * r * 0.55);
				ctx.quadraticCurveTo(
					cx + Math.cos(a) * r * 0.35,
					cy + Math.sin(a) * r * 0.35,
					ax - Math.cos(a + Math.PI / 2) * r * 0.55,
					ay - Math.sin(a + Math.PI / 2) * r * 0.55
				);
				ctx.stroke();
			}
			ctx.restore();
		}
	}
];

export const EFFECTS: Effect[] = [...move, ...appear, ...color, ...shine, ...breakFx, ...decorate];
export const effectById = (id: string) => EFFECTS.find((e) => e.id === id);
