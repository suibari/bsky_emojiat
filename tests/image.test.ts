import { describe, expect, it } from 'vitest';
import { imageRect, removeBackground } from '../src/lib/render/image';
import { defaultImage, normalizeRecipe } from '../src/lib/render/recipe';

const box = { x: 0, y: 0, w: 128, h: 128 };

describe('imageRect', () => {
	it('fits a wide image inside the box with contain', () => {
		const r = imageRect(200, 100, box, { fit: 'contain', zoom: 1, x: 0, y: 0 });
		expect(r).toEqual({ x: 0, y: 32, w: 128, h: 64 });
	});
	it('fills the box with cover', () => {
		const r = imageRect(200, 100, box, { fit: 'cover', zoom: 1, x: 0, y: 0 });
		expect(r.h).toBe(128);
		expect(r.w).toBe(256);
		expect(r.x).toBe(-64);
	});
	it('zooms around the center and shifts by box ratio', () => {
		const r = imageRect(100, 100, box, { fit: 'contain', zoom: 2, x: 0.25, y: 0 });
		expect(r).toEqual({ x: -64 + 32, y: -64, w: 256, h: 256 });
	});
});

/** 色の配列から RGBA を作る。'w' 白、'r' 赤、'.' 透明 */
function img(rows: string[]) {
	const h = rows.length;
	const w = rows[0].length;
	const data = new Uint8ClampedArray(w * h * 4);
	rows.forEach((row, y) =>
		[...row].forEach((c, x) => {
			const i = (y * w + x) * 4;
			const rgb = c === 'r' ? [255, 0, 0] : [255, 255, 255];
			data.set([...rgb, c === '.' ? 0 : 255], i);
		})
	);
	return { data, w, h };
}
const alphaAt = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

describe('removeBackground', () => {
	it('clears the background connected to the edge and keeps the subject', () => {
		const { data, w, h } = img(['wwwww', 'wrrrw', 'wrwrw', 'wrrrw', 'wwwww']);
		removeBackground(data, w, h, 0.1);
		expect(alphaAt(data, w, 0, 0)).toBe(0);
		expect(alphaAt(data, w, 1, 1)).toBe(255);
		// 赤に囲まれた白は外とつながっていないので残る
		expect(alphaAt(data, w, 2, 2)).toBe(255);
	});
	it('passes through already transparent pixels', () => {
		const { data, w, h } = img(['..w..', '.rrr.', '.....']);
		removeBackground(data, w, h, 0.1);
		expect(alphaAt(data, w, 2, 0)).toBe(0);
		expect(alphaAt(data, w, 2, 1)).toBe(255);
	});
});

describe('normalizeRecipe image', () => {
	it('keeps a valid image and clamps its settings', () => {
		const src = 'data:image/png;base64,AAAA';
		const r = normalizeRecipe({ source: 'image', image: { ...defaultImage(src), zoom: 99, fit: 'cover' } });
		expect(r.source).toBe('image');
		expect(r.image?.zoom).toBe(4);
		expect(r.image?.fit).toBe('cover');
	});
	it('falls back to text when the image is missing or not a data URL', () => {
		expect(normalizeRecipe({ source: 'image' }).source).toBe('text');
		expect(normalizeRecipe({ source: 'image', image: { src: 'https://example.com/a.png' } }).image).toBeNull();
	});
});
