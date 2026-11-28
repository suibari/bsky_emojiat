import { describe, expect, it } from 'vitest';
import { MAX_STRETCH, glyphCells, layoutText, slots, splitLines } from '../src/lib/render/layout';

// 全角1文字 = 幅100・高さ100 として測る簡易メジャー
const measure = (text: string) => ({ width: [...text].length * 100, ascent: 80, descent: 20 });
const base = { padding: 0, lineHeight: 1, vertical: false, measure };

describe('splitLines', () => {
	it('drops empty lines and trims', () => {
		expect(splitLines(' ありが \n\nとう\n')).toEqual(['ありが', 'とう']);
	});
});

describe('slots', () => {
	it('divides evenly when lineHeight is 1', () => {
		const s = slots(128, 2, 1);
		expect(s.size).toBe(64);
		expect(s.centers).toEqual([32, 96]);
	});
	it('keeps the whole block inside the box with gaps', () => {
		const s = slots(128, 3, 1.2);
		const last = s.centers[2] + s.size / 2;
		expect(last).toBeCloseTo(128);
	});
});

describe('layoutText', () => {
	it('fits each line to the full width of a square', () => {
		const p = layoutText({ ...base, text: 'ありが\nとう', width: 128, height: 128 });
		expect(p).toHaveLength(2);
		// 1行目: 縦 64/100、横は 128/300 に縮む
		expect(p[0].sy).toBeCloseTo(0.64);
		expect(p[0].sx).toBeCloseTo(128 / 300);
		// 2行目: 横は 128/200=0.64 で縦と同じ
		expect(p[1].sx).toBeCloseTo(0.64);
	});

	it('limits horizontal stretch on wide emoji', () => {
		const p = layoutText({ ...base, text: 'あ', width: 512, height: 128 });
		expect(p[0].sy).toBeCloseTo(1.28);
		expect(p[0].sx).toBeCloseTo(1.28 * MAX_STRETCH);
		expect(p[0].cx).toBe(256);
	});

	it('places vertical columns from right to left', () => {
		const p = layoutText({ ...base, vertical: true, text: 'あい\nう', width: 128, height: 128 });
		expect(p.map((x) => x.text)).toEqual(['あ', 'い', 'う']);
		expect(p[0].cx).toBeGreaterThan(p[2].cx);
		expect(p[0].cy).toBeLessThan(p[1].cy);
	});

	it('applies padding', () => {
		const p = layoutText({ ...base, padding: 0.25, text: 'あ', width: 128, height: 128 });
		expect(p[0].sy).toBeCloseTo(0.64);
	});
});

describe('glyphCells', () => {
	const edges = (p: { text: string; cx: number; sx: number; measure: { width: number } }) => {
		const n = [...p.text].length;
		const left = p.cx - (p.measure.width * p.sx) / 2;
		return Array.from({ length: n - 1 }, (_, k) => left + ((k + 1) * p.measure.width * p.sx) / n);
	};
	it('splits horizontal lines into one cell per character covering the whole tile', () => {
		const p = layoutText({ ...base, text: 'ありが\nとう', width: 128, height: 128 });
		const cells = glyphCells(p, 128, 128, false, edges);
		expect(cells).toHaveLength(5);
		expect(cells[0]).toMatchObject({ x0: 0, y0: 0, y1: 64 });
		expect(cells[2].x1).toBe(128);
		expect(cells[3]).toMatchObject({ x0: 0, y0: 64, y1: 128 });
		const area = cells.reduce((a, c) => a + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
		expect(area).toBeCloseTo(128 * 128);
	});
	it('keeps horizontal boundaries finite, ordered and inside the tile', () => {
		const p = layoutText({ ...base, text: 'あいうえお', width: 128, height: 128 });
		const cells = glyphCells(p, 128, 128, false, () => [40, 39, Number.NaN, 130]);
		expect(cells.map(({ x0, x1 }) => [x0, x1])).toEqual([[0, 40], [40, 40], [40, 40], [40, 128], [128, 128]]);
	});

	it('orders vertical columns right to left', () => {
		const p = layoutText({ ...base, vertical: true, text: 'あい\nう', width: 128, height: 128 });
		const cells = glyphCells(p, 128, 128, true, edges);
		expect(cells).toHaveLength(3);
		expect(cells[0].x1).toBe(128);
		expect(cells[2].x0).toBe(0);
		expect(cells[1]).toMatchObject({ y0: 64, y1: 128 });
	});
});
