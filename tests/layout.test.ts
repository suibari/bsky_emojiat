import { describe, expect, it } from 'vitest';
import { MAX_STRETCH, layoutText, slots, splitLines } from '../src/lib/render/layout';

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
