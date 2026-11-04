export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Surface = HTMLCanvasElement | OffscreenCanvas;

/** 1フレームの情報。t は 0〜1 のループ位相、s は 128px 基準からの拡大率。 */
export type Frame = {
	t: number;
	w: number;
	h: number;
	s: number;
	/** 文字の主な色（塗りが単色ならその色、グラデなら先頭色） */
	color: string;
};

export type Transform = { dx: number; dy: number; sx: number; sy: number; rot: number; alpha: number };

export type CategoryId = 'move' | 'appear' | 'color' | 'shine' | 'break' | 'decorate';

export type Effect = {
	id: string;
	category: CategoryId;
	label: string;
	labelEn: string;
	/** 効果の説明。将来、入力語との埋め込み類似度でおすすめを出すときにも使う。 */
	description: string;
	/** 全体の位置・大きさ・回転・透明度を変える */
	transform?: (f: Frame, tr: Transform) => void;
	/** 文字の塗りだけを塗り替える（source-atop 済みの文脈で呼ばれる） */
	paint?: (ctx: Ctx2D, f: Frame) => void;
	/** 画像全体を加工する。src を dst に描き写す */
	filter?: (dst: Ctx2D, src: Surface, f: Frame) => void;
	/** 文字の後ろに描く */
	under?: (ctx: Ctx2D, f: Frame) => void;
	/** 文字の手前に描く */
	over?: (ctx: Ctx2D, f: Frame) => void;
};

export const CATEGORIES: { id: CategoryId; label: string; labelEn: string }[] = [
	{ id: 'move', label: '動き', labelEn: 'Move' },
	{ id: 'appear', label: '登場', labelEn: 'Enter' },
	{ id: 'color', label: '色', labelEn: 'Color' },
	{ id: 'shine', label: '光', labelEn: 'Light' },
	{ id: 'break', label: '崩す', labelEn: 'Break' },
	{ id: 'decorate', label: '飾る', labelEn: 'Decor' }
];

export const TAU = Math.PI * 2;

/** フレームごとに同じ値を返す疑似乱数（GIFの各コマを決定的にする） */
export function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeOutBack = (x: number) => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutBounce = (x: number) => {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (x < 1 / d1) return n1 * x * x;
	if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
	if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
	return n1 * (x -= 2.625 / d1) * x + 0.984375;
};
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
