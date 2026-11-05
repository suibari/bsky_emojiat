import { cssFont, fontById } from './fonts';
import { layoutText, type Measure } from './layout';
import { emojiSize, usesImage, type ImageSource, type Recipe } from './recipe';
import { ensureFont } from './fonts';
import { ensureImage, imageRect, imageSurface } from './image';
import { effectById, type Ctx2D, type Effect, type Frame, type Surface, type Transform } from './effects';

const REF = 100;
const ITALIC_SKEW = -0.22;

export function createSurface(w: number, h: number): Surface {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}
const ctxOf = (s: Surface) => s.getContext('2d', { willReadFrequently: false }) as Ctx2D;

/** 文字の縁取りと塗りを別々の層に描いておく。色系エフェクトは塗りの層だけを塗り替える。 */
export type BaseLayers = {
	stroke: Surface;
	fill: Surface;
	w: number;
	h: number;
	scale: number;
	color: string;
	/** 塗りの層が画像か。色系エフェクトは画像を塗りつぶさず、上から重ねる */
	image: boolean;
};

/** 描く前に必要なもの（書体か画像）を読み込む。 */
export const prepare = (recipe: Recipe) =>
	usesImage(recipe) ? ensureImage(recipe.image) : ensureFont(fontById(recipe.font), recipe.text);

/** 縁取りの太さぶん外側に広げる方向。太いほど角が丸く見えるよう数を増やす。 */
const ringOffsets = (r: number) => {
	const out: [number, number][] = [];
	for (const radius of r > 3 ? [r, r * 0.5] : [r]) {
		const n = Math.max(8, Math.min(32, Math.round(radius * 4)));
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
		}
	}
	return out;
};

function renderImageBase(recipe: Recipe, image: ImageSource, scale: number): BaseLayers {
	const { width, height } = emojiSize(recipe.aspect);
	const w = Math.round(width * scale);
	const h = Math.round(height * scale);
	const stroke = createSurface(w, h);
	const fill = createSurface(w, h);
	const fctx = ctxOf(fill);
	const strokePx = recipe.stroke.enabled ? recipe.stroke.width * scale : 0;
	const color = recipe.stroke.enabled ? recipe.stroke.color : '#ffffff';
	const src = imageSurface(image);
	if (!src) return { stroke, fill, w, h, scale, color, image: true };

	// 縁取りが枠からはみ出さないよう、余白に縁取りの太さを足す
	const pad = recipe.padding * h + strokePx;
	const box = { x: pad, y: pad, w: Math.max(1, w - pad * 2), h: Math.max(1, h - pad * 2) };
	const r = imageRect(src.width, src.height, box, image);
	fctx.save();
	fctx.beginPath();
	fctx.rect(box.x, box.y, box.w, box.h);
	fctx.clip();
	fctx.imageSmoothingQuality = 'high';
	fctx.drawImage(src, r.x, r.y, r.w, r.h);
	fctx.restore();

	if (strokePx > 0) {
		// 画像の形を縁取りの色で塗り、まわりにずらして重ねる
		const silhouette = createSurface(w, h);
		const sil = ctxOf(silhouette);
		sil.drawImage(fill, 0, 0);
		sil.globalCompositeOperation = 'source-in';
		sil.fillStyle = recipe.stroke.color;
		sil.fillRect(0, 0, w, h);
		const sctx = ctxOf(stroke);
		for (const [dx, dy] of ringOffsets(strokePx)) sctx.drawImage(silhouette, dx, dy);
		sctx.drawImage(silhouette, 0, 0);
	}
	return { stroke, fill, w, h, scale, color, image: true };
}

export function renderBase(recipe: Recipe, scale: number): BaseLayers {
	if (usesImage(recipe)) return renderImageBase(recipe, recipe.image, scale);
	const { width, height } = emojiSize(recipe.aspect);
	const w = Math.round(width * scale);
	const h = Math.round(height * scale);
	const font = fontById(recipe.font);
	const stroke = createSurface(w, h);
	const fill = createSurface(w, h);
	const sctx = ctxOf(stroke);
	const fctx = ctxOf(fill);

	const measurer = ctxOf(createSurface(8, 8));
	measurer.font = cssFont(font, REF);
	const measure = (text: string): Measure & { left: number } => {
		const m = measurer.measureText(text);
		const left = m.actualBoundingBoxLeft;
		return {
			width: Math.max(1, left + m.actualBoundingBoxRight),
			left,
			ascent: m.actualBoundingBoxAscent,
			descent: m.actualBoundingBoxDescent
		};
	};
	const placements = layoutText({
		text: recipe.text,
		width: w,
		height: h,
		padding: recipe.padding + (recipe.stroke.enabled ? recipe.stroke.width / 128 : 0),
		lineHeight: recipe.lineHeight,
		vertical: recipe.vertical,
		measure
	});

	const strokePx = recipe.stroke.width * scale;
	for (const [ctx, mode] of [
		[sctx, 'stroke'],
		[fctx, 'fill']
	] as const) {
		if (mode === 'stroke' && !recipe.stroke.enabled) continue;
		ctx.font = cssFont(font, REF);
		ctx.textBaseline = 'alphabetic';
		ctx.textAlign = 'left';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = recipe.stroke.color;
		ctx.fillStyle = '#fff';
		for (const p of placements) {
			const m = p.measure as Measure & { left: number };
			ctx.save();
			ctx.translate(p.cx, p.cy);
			if (recipe.italic) ctx.transform(1, 0, ITALIC_SKEW, 1, 0, 0);
			ctx.scale(p.sx, p.sy);
			const x = -m.width / 2 + m.left;
			const y = (m.ascent - m.descent) / 2;
			if (mode === 'stroke') {
				// 縁取りの内側半分は塗りに隠れるので 2 倍の太さで描く
				ctx.lineWidth = (strokePx * 2) / Math.sqrt(p.sx * p.sy);
				ctx.strokeText(p.text, x, y);
				ctx.fillStyle = recipe.stroke.color;
				ctx.fillText(p.text, x, y);
			} else {
				ctx.fillText(p.text, x, y);
			}
			ctx.restore();
		}
	}

	// 塗り: 白で描いた字形に色を重ねる
	fctx.globalCompositeOperation = 'source-in';
	if (recipe.fill.kind === 'solid') {
		fctx.fillStyle = recipe.fill.color;
	} else {
		const g = fctx.createLinearGradient(0, 0, 0, h);
		const stops = recipe.fill.stops;
		stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
		fctx.fillStyle = g;
	}
	fctx.fillRect(0, 0, w, h);
	fctx.globalCompositeOperation = 'source-over';

	const color = recipe.fill.kind === 'solid' ? recipe.fill.color : recipe.fill.stops[0];
	return { stroke, fill, w, h, scale, color, image: false };
}

/** フレーム描画で使い回す作業用キャンバス。 */
export type Workspace = { fill: Surface; a: Surface; b: Surface };
export const createWorkspace = (w: number, h: number): Workspace => ({
	fill: createSurface(w, h),
	a: createSurface(w, h),
	b: createSurface(w, h)
});

export const resolveEffects = (ids: string[]) =>
	ids.map(effectById).filter((e): e is Effect => e !== undefined);

export function renderFrame(
	ctx: Ctx2D,
	base: BaseLayers,
	recipe: Recipe,
	effects: Effect[],
	t: number,
	ws: Workspace
) {
	const { w, h } = base;
	const f: Frame = { t, w, h, s: base.scale, color: base.color };

	// 1. 塗りの層に色系エフェクト
	let fillSrc: Surface = base.fill;
	const painters = effects.filter((e) => e.paint);
	if (painters.length) {
		const c = ctxOf(ws.fill);
		c.clearRect(0, 0, w, h);
		c.drawImage(base.fill, 0, 0);
		c.globalCompositeOperation = 'source-atop';
		// 画像は塗りつぶすと絵が消えるので、半分透かして重ねる
		if (base.image) c.globalAlpha = 0.55;
		for (const e of painters) {
			c.save();
			e.paint!(c, f);
			c.restore();
		}
		c.globalCompositeOperation = 'source-over';
		c.globalAlpha = 1;
		fillSrc = ws.fill;
	}

	// 2. 縁取り + 塗りを合成
	let src: Surface = ws.a;
	let spare: Surface = ws.b;
	{
		const c = ctxOf(src);
		c.clearRect(0, 0, w, h);
		c.drawImage(base.stroke, 0, 0);
		c.drawImage(fillSrc, 0, 0);
	}

	// 3. 画像全体の加工（順に適用）
	for (const e of effects) {
		if (!e.filter) continue;
		const c = ctxOf(spare);
		c.clearRect(0, 0, w, h);
		c.save();
		e.filter(c, src, f);
		c.restore();
		[src, spare] = [spare, src];
	}

	// 4. 出力
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, w, h);
	if (recipe.background) {
		ctx.fillStyle = recipe.background;
		ctx.fillRect(0, 0, w, h);
	}
	for (const e of effects) {
		if (!e.under) continue;
		ctx.save();
		e.under(ctx, f);
		ctx.restore();
	}
	const tr: Transform = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1 };
	for (const e of effects) e.transform?.(f, tr);
	ctx.save();
	ctx.globalAlpha = Math.min(1, Math.max(0, tr.alpha));
	ctx.translate(w / 2 + tr.dx, h / 2 + tr.dy);
	ctx.rotate(tr.rot);
	ctx.scale(tr.sx, tr.sy);
	ctx.drawImage(src, -w / 2, -h / 2);
	ctx.restore();
	for (const e of effects) {
		if (!e.over) continue;
		ctx.save();
		e.over(ctx, f);
		ctx.restore();
	}
	ctx.restore();
}
