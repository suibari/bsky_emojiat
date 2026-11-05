import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { createSurface, createWorkspace, prepare, renderBase, renderFrame, resolveEffects } from './draw';
import { isAnimated, type Recipe } from './recipe';
import type { Ctx2D } from './effects';

/** Nagi が gif_128 / png_128 として受け付ける blob の上限（nagi_client の MAX_EMOJI_BLOB_SIZE）。 */
export const MAX_EMOJI_BYTES = 262_144;

/** 上限を超えたら、コマ数 → 色数の順に落として作り直す。 */
export const GIF_ATTEMPTS = [
	{ fps: 24, colors: 256 },
	{ fps: 20, colors: 128 },
	{ fps: 15, colors: 96 },
	{ fps: 12, colors: 64 },
	{ fps: 10, colors: 32 },
	{ fps: 8, colors: 16 }
];

export type Encoded = { blob: Blob; width: number; height: number; fps?: number; tooLarge: boolean };

const nextTick = () => new Promise((r) => setTimeout(r, 0));

async function toPng(surface: ReturnType<typeof createSurface>): Promise<Blob> {
	if ('convertToBlob' in surface) return surface.convertToBlob({ type: 'image/png' });
	return new Promise((resolve, reject) =>
		(surface as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
	);
}

export async function encodeEmoji(recipe: Recipe, onProgress?: (p: number) => void): Promise<Encoded> {
	await prepare(recipe);
	const base = renderBase(recipe, 1);
	const { w, h } = base;
	const out = createSurface(w, h);
	const ctx = out.getContext('2d', { willReadFrequently: true }) as Ctx2D;
	const ws = createWorkspace(w, h);
	const effects = resolveEffects(recipe.effects);

	if (!isAnimated(recipe)) {
		renderFrame(ctx, base, recipe, [], 0, ws);
		const blob = await toPng(out);
		return { blob, width: w, height: h, tooLarge: blob.size > MAX_EMOJI_BYTES };
	}

	let last: Encoded | undefined;
	for (let a = 0; a < GIF_ATTEMPTS.length; a++) {
		const { fps, colors } = GIF_ATTEMPTS[a];
		const frames = Math.max(2, Math.round(recipe.duration * fps));
		const delay = Math.round((recipe.duration * 1000) / frames);
		const gif = GIFEncoder();
		for (let i = 0; i < frames; i++) {
			renderFrame(ctx, base, recipe, effects, i / frames, ws);
			const { data } = ctx.getImageData(0, 0, w, h);
			const palette = quantize(data, colors, { format: 'rgba4444', oneBitAlpha: true });
			const index = applyPalette(data, palette, 'rgba4444');
			const transparentIndex = palette.findIndex((c) => c[3] === 0);
			gif.writeFrame(index, w, h, {
				palette,
				delay,
				transparent: transparentIndex >= 0,
				transparentIndex
			});
			onProgress?.((a + (i + 1) / frames) / GIF_ATTEMPTS.length);
			if (i % 4 === 3) await nextTick();
		}
		gif.finish();
		const blob = new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
		last = { blob, width: w, height: h, fps, tooLarge: blob.size > MAX_EMOJI_BYTES };
		if (!last.tooLarge) break;
	}
	onProgress?.(1);
	return last!;
}
