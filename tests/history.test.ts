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

	it('adds a new entry, then updates the same one', async () => {
		const a = await rememberEmoji({ name: 'a', recipe: defaultRecipe(), encoded });
		const b = await rememberEmoji({ id: a.id, name: 'a', recipe: { ...defaultRecipe(), text: 'x' }, encoded });
		expect(b.id).toBe(a.id);
		expect(b.createdAt).toBe(a.createdAt);
		expect(db.size).toBe(1);
	});

	it('keeps the PDS mark only while the emoji is unchanged', async () => {
		const saved = await rememberEmoji({ name: 'a', recipe: defaultRecipe(), encoded, rkey: 'emojiat_1' });
		const same = await rememberEmoji({ id: saved.id, name: 'a', recipe: defaultRecipe(), encoded });
		expect(same.rkey).toBe('emojiat_1');
		const changed = await rememberEmoji({ id: saved.id, name: 'a', recipe: { ...defaultRecipe(), aspect: 2 }, encoded });
		expect(changed.rkey).toBeUndefined();
	});
});
