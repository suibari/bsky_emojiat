import type { Recipe } from '$lib/render/recipe';

/** ログインしていなくても使えるよう、作った絵文字はまずブラウザの IndexedDB に置く。 */
export type LocalEmoji = {
	id: string;
	name: string;
	recipe: Recipe;
	blob: Blob;
	width: number;
	height: number;
	createdAt: string;
	updatedAt: string;
	/** PDS へ移したときの rkey */
	rkey?: string;
};

const DB = 'emojiat';
const STORE = 'emojis';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const req = run(db.transaction(STORE, mode).objectStore(STORE));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	} finally {
		db.close();
	}
}

export const newLocalId = () => crypto.randomUUID();

export async function listLocal(): Promise<LocalEmoji[]> {
	const all = await tx<LocalEmoji[]>('readonly', (s) => s.getAll());
	return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export const getLocal = (id: string) => tx<LocalEmoji | undefined>('readonly', (s) => s.get(id));
export const putLocal = (emoji: LocalEmoji) => tx('readwrite', (s) => s.put(emoji));
export const deleteLocal = (id: string) => tx('readwrite', (s) => s.delete(id));
