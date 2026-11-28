import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES, EFFECTS, effectById, type Ctx2D, type Frame, type Surface } from '../src/lib/render/effects';

describe('EFFECTS', () => {
	it('has unique ids', () => {
		const ids = EFFECTS.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('every effect belongs to a known category and does something', () => {
		const cats = new Set(CATEGORIES.map((c) => c.id));
		for (const e of EFFECTS) {
			expect(cats.has(e.category)).toBe(true);
			expect(e.transform || e.paint || e.filter || e.under || e.over).toBeTruthy();
		}
	});
});

describe('per-glyph effects', () => {
	const frame: Frame = {
		t: 0.7,
		w: 64,
		h: 32,
		s: 0.25,
		color: '#1185fe',
		glyphs: [
			{ x0: 0, x1: 23.5, y0: 0, y1: 32 },
			{ x0: 23.5, x1: 64, y0: 0, y1: 32 }
		],
		opaque: false
	};

	it.each([['hop', 2], ['stack', 6]] as const)('%s only draws its source within each cell', (id, count) => {
		const src = { width: frame.w, height: frame.h } as Surface;
		const readAlpha = {
			drawImage: vi.fn(),
			getImageData: () => ({ data: new Uint8ClampedArray(frame.w * frame.h * 4).fill(255) }),
			setTransform: vi.fn(),
			clearRect: vi.fn()
		};
		class ReadSurface {
			constructor(public width: number, public height: number) {}
			getContext() {
				return readAlpha;
			}
		}
		vi.stubGlobal('OffscreenCanvas', ReadSurface);
		const dst = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn() };
		try {
			effectById(id)!.filter!(dst as unknown as Ctx2D, src, frame);
			expect(dst.drawImage).toHaveBeenCalledTimes(count);
			let area = 0;
			for (const [image, x, y, w, h, dx, dy, dw, dh] of dst.drawImage.mock.calls) {
				expect(image).toBe(src);
				expect([dx, dy, dw, dh]).toEqual([x, y, w, h]);
				expect(w).toBeGreaterThan(0);
				expect(h).toBeGreaterThan(0);
				const insideCell = frame.glyphs.some(
					(cell) => x >= cell.x0 && x + w <= cell.x1 && y >= cell.y0 && y + h <= cell.y1
				);
				expect(insideCell).toBe(true);
				area += w * h;
			}
			expect(area).toBe(frame.w * frame.h);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
