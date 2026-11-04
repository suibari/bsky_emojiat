/**
 * 絵文字の「レシピ」。画像はいつでもここから作り直せるので、PDSにはレシピも一緒に保存して
 * 後から編集できるようにする（com.suibari.emojiat.recipe）。
 */
export type Aspect = 1 | 2 | 3 | 4;

export type Fill =
	| { kind: 'solid'; color: string }
	| { kind: 'gradient'; stops: string[] };

export type Recipe = {
	v: 1;
	text: string;
	font: string;
	fill: Fill;
	stroke: { enabled: boolean; color: string; width: number };
	italic: boolean;
	vertical: boolean;
	/** 行の間隔。1 で行同士が接する。 */
	lineHeight: number;
	/** 外周の余白。高さに対する割合。 */
	padding: number;
	aspect: Aspect;
	background: string | null;
	effects: string[];
	/** アニメーション1周の秒数。 */
	duration: number;
};

export const EMOJI_HEIGHT = 128;
export const ASPECTS: Aspect[] = [1, 2, 3, 4];

export const SOLID_COLORS = [
	'#1185fe',
	'#ffffff',
	'#111418',
	'#ff4d4f',
	'#ff8a1f',
	'#ffd21f',
	'#2fc96f',
	'#14c4d8',
	'#8b6cff',
	'#ff5fa8'
];

export const GRADIENTS: { id: string; label: string; labelEn: string; stops: string[] }[] = [
	{ id: 'sky', label: '空', labelEn: 'Sky', stops: ['#7cc4ff', '#1185fe'] },
	{ id: 'deep', label: '深海', labelEn: 'Deep', stops: ['#1185fe', '#0b2a6b'] },
	{ id: 'sunset', label: '夕焼け', labelEn: 'Sunset', stops: ['#ffd21f', '#ff4d4f'] },
	{ id: 'mint', label: 'ミント', labelEn: 'Mint', stops: ['#c2ffdf', '#14c4a0'] },
	{ id: 'peach', label: '桃', labelEn: 'Peach', stops: ['#ffe0ef', '#ff5fa8'] },
	{ id: 'gold', label: '金', labelEn: 'Gold', stops: ['#fff3b0', '#d79a00', '#fff3b0'] },
	{ id: 'silver', label: '銀', labelEn: 'Silver', stops: ['#ffffff', '#8b97a6', '#e8edf2'] },
	{ id: 'rainbow', label: '虹', labelEn: 'Rainbow', stops: ['#ff4d4f', '#ffd21f', '#2fc96f', '#1185fe', '#8b6cff'] }
];

export const defaultRecipe = (): Recipe => ({
	v: 1,
	text: 'えもじ\nあっと',
	font: 'mplus',
	fill: { kind: 'solid', color: '#1185fe' },
	stroke: { enabled: true, color: '#ffffff', width: 6 },
	italic: false,
	vertical: false,
	lineHeight: 1.05,
	padding: 0.04,
	aspect: 1,
	background: null,
	effects: [],
	duration: 1.2
});

export const emojiSize = (aspect: Aspect) => ({ width: EMOJI_HEIGHT * aspect, height: EMOJI_HEIGHT });

export const isAnimated = (recipe: Recipe) => recipe.effects.length > 0;

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const isColor = (value: unknown): value is string =>
	typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/** PDSや IndexedDB から読んだ値は信用せず、欠けた項目は既定値で補う。 */
export function normalizeRecipe(raw: unknown): Recipe {
	const base = defaultRecipe();
	const r = (raw ?? {}) as Record<string, any>;
	let fill: Fill = base.fill;
	if (r.fill?.kind === 'solid' && isColor(r.fill.color)) fill = { kind: 'solid', color: r.fill.color };
	else if (
		r.fill?.kind === 'gradient' &&
		Array.isArray(r.fill.stops) &&
		r.fill.stops.length >= 2 &&
		r.fill.stops.length <= 8 &&
		r.fill.stops.every(isColor)
	)
		fill = { kind: 'gradient', stops: r.fill.stops };
	return {
		v: 1,
		text: typeof r.text === 'string' ? r.text.slice(0, 64) : base.text,
		font: typeof r.font === 'string' ? r.font : base.font,
		fill,
		stroke: {
			enabled: typeof r.stroke?.enabled === 'boolean' ? r.stroke.enabled : base.stroke.enabled,
			color: isColor(r.stroke?.color) ? r.stroke.color : base.stroke.color,
			width: clamp(r.stroke?.width, 1, 16, base.stroke.width)
		},
		italic: r.italic === true,
		vertical: r.vertical === true,
		lineHeight: clamp(r.lineHeight, 0.7, 1.6, base.lineHeight),
		padding: clamp(r.padding, 0, 0.25, base.padding),
		aspect: ASPECTS.includes(r.aspect) ? r.aspect : base.aspect,
		background: isColor(r.background) ? r.background : null,
		effects: Array.isArray(r.effects)
			? r.effects.filter((id: unknown): id is string => typeof id === 'string').slice(0, 8)
			: [],
		duration: clamp(r.duration, 0.5, 3, base.duration)
	};
}
