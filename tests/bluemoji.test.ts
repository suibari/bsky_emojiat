import { describe, expect, it } from 'vitest';
import { BLUEMOJI_ITEM, altOf, blobInfo, buildItemRecord, createRkey } from '../src/lib/atproto/bluemoji';
import { defaultRecipe, normalizeRecipe } from '../src/lib/render/recipe';

const blob = { $type: 'blob', ref: { $link: 'bafkreiexample' }, mimeType: 'image/gif', size: 1234 };

describe('buildItemRecord', () => {
	it('matches the shape Nagi reads (nagi_client fetchMyBluemoji)', () => {
		const rec = buildItemRecord({ name: 'yatta', alt: 'やった', blob, mimeType: 'image/gif', createdAt: '2026-11-04T00:00:00.000Z' });
		expect(rec).toEqual({
			$type: BLUEMOJI_ITEM,
			name: ':yatta:',
			alt: 'やった',
			adultOnly: false,
			fallbackText: '◌',
			createdAt: '2026-11-04T00:00:00.000Z',
			formats: { $type: `${BLUEMOJI_ITEM}#formats_v0`, gif_128: blob }
		});
		// fallbackText は 1 書記素・10文字以内
		expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(rec.fallbackText)]).toHaveLength(1);
	});

	it('uses png_128 for still images and rejects unknown types', () => {
		const rec = buildItemRecord({ name: 'a', alt: '', blob, mimeType: 'image/png', createdAt: 'x' });
		expect(Object.keys(rec.formats)).toContain('png_128');
		expect('alt' in rec).toBe(false);
		expect(() => buildItemRecord({ name: 'a', alt: '', blob, mimeType: 'image/jpeg', createdAt: 'x' })).toThrow();
	});
});

describe('createRkey', () => {
	it('is a valid record key and unique', () => {
		const a = createRkey();
		expect(a).toMatch(/^emojiat_[0-9a-f]{32}$/);
		expect(createRkey()).not.toBe(a);
	});
});

describe('normalizeRecipe', () => {
	it('fills defaults and clamps untrusted values', () => {
		const r = normalizeRecipe({ text: 'x', aspect: 9, lineHeight: 99, fill: { kind: 'solid', color: 'red' }, effects: ['a', 1] });
		expect(r.aspect).toBe(1);
		expect(r.lineHeight).toBe(1.6);
		expect(r.fill).toEqual(defaultRecipe().fill);
		expect(r.effects).toEqual(['a']);
	});
	it('keeps wide aspect up to 4', () => {
		expect(normalizeRecipe({ aspect: 4 }).aspect).toBe(4);
	});
	it('builds alt text from the recipe', () => {
		expect(altOf({ ...defaultRecipe(), text: 'ありが\nとう' })).toBe('ありが とう');
	});
});

describe('blobInfo', () => {
	it('reads raw JSON refs', () => {
		expect(blobInfo({ ref: { $link: 'bafyA' }, mimeType: 'image/gif', size: 1 })).toEqual({ cid: 'bafyA', mimeType: 'image/gif' });
	});
	it('reads refs decoded into CID objects by @atproto/api', () => {
		const cid = { toString: () => 'bafyB' };
		expect(blobInfo({ ref: cid, mimeType: 'image/webp', size: 1 })).toEqual({ cid: 'bafyB', mimeType: 'image/webp' });
	});
	it('rejects missing refs', () => {
		expect(blobInfo({ mimeType: 'image/png' })).toBeUndefined();
		expect(blobInfo({ ref: {}, mimeType: 'image/png' })).toBeUndefined();
	});
});
