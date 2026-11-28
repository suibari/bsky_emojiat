import { describe, expect, it } from 'vitest';
import { CATEGORIES, EFFECTS } from '../src/lib/render/effects';

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
