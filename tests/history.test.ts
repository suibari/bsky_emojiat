import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalEmoji } from '../src/lib/store/local';
import { defaultRecipe } from '../src/lib/render/recipe';

const db = new Map<string, LocalEmoji>();
vi.mock('../src/lib/store/local', () => ({
	newLocalId: () => `id${db.size + 1}`,
	getLocal: async (id: string) => db.get(id),
	putLocal: async (e: LocalEmoji) => void db.set(e.id, e)
}));
const { rememberEmoji } = await import('../src/lib/store/history');

const encoded = { blob: new Blob(['x'], { type: 'image/png' }), width: 128, height: 128, tooLarge: false };

describe('rememberEmoji', () => {
	beforeEach(() => db.clear());

	it('updates the same entry when the content is unchanged', async () => {
		const a = await rememberEmoji({ name: 'a', recipe: defaultRecipe(), encoded });
		const b = await rememberEmoji({ id: a.id, name: 'a', recipe: defaultRecipe(), encoded });
		expect(b.id).toBe(a.id);
		expect(b.createdAt).toBe(a.createdAt);
		expect(db.size).toBe(1);
	});

	it('keeps A when B is made from it (A to PDS, edit, B to PDS)', async () => {
		const a = await rememberEmoji({ name: 'a', recipe: defaultRecipe(), encoded, rkey: 'emojiat_a' });
		const b = await rememberEmoji({ id: a.id, name: 'b', recipe: { ...defaultRecipe(), text: 'B' }, encoded, rkey: 'emojiat_b' });
		expect(b.id).not.toBe(a.id);
		expect(db.size).toBe(2);
		expect(db.get(a.id)?.rkey).toBe('emojiat_a');
		expect(db.get(b.id)?.rkey).toBe('emojiat_b');
	});

	it('makes a new entry for a changed download, without the PDS mark', async () => {
		const saved = await rememberEmoji({ name: 'a', recipe: defaultRecipe(), encoded, rkey: 'emojiat_1' });
		const same = await rememberEmoji({ id: saved.id, name: 'a', recipe: defaultRecipe(), encoded });
		expect(same.id).toBe(saved.id);
		expect(same.rkey).toBe('emojiat_1');
		const changed = await rememberEmoji({ id: saved.id, name: 'a', recipe: { ...defaultRecipe(), aspect: 2 }, encoded });
		expect(changed.id).not.toBe(saved.id);
		expect(changed.rkey).toBeUndefined();
		expect(db.size).toBe(2);
	});
});
