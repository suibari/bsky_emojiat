import type { Encoded } from '$lib/render/encode';
import type { Recipe } from '$lib/render/recipe';
import { getLocal, newLocalId, putLocal, type LocalEmoji } from './local';

/**
 * ダウンロード・PDS 保存のたびに、作った絵文字をブラウザの履歴へ残す。
 *
 * 書き出した絵文字は1つずつ別物として扱う。PDS 保存は毎回新しい絵文字を作るので、
 * 内容（名前と作り方）を変えて書き出したら履歴にも新しい項目を足し、前の項目は残す。
 * 内容が同じまま書き出し直したときだけ同じ項目を更新する（重複を作らない）。
 *
 * rkey は「この内容が PDS にある」印。同じ内容の項目を更新するときは前の印を引き継ぐ。
 */
export async function rememberEmoji(input: {
	id?: string;
	name: string;
	recipe: Recipe;
	encoded: Encoded;
	rkey?: string;
}): Promise<LocalEmoji> {
	const now = new Date().toISOString();
	const prev = input.id ? await getLocal(input.id) : undefined;
	const same =
		prev !== undefined && prev.name === input.name && JSON.stringify(prev.recipe) === JSON.stringify(input.recipe)
			? prev
			: undefined;
	const entry: LocalEmoji = {
		id: same?.id ?? newLocalId(),
		name: input.name,
		recipe: input.recipe,
		blob: input.encoded.blob,
		width: input.encoded.width,
		height: input.encoded.height,
		createdAt: same?.createdAt ?? now,
		updatedAt: now,
		rkey: input.rkey ?? same?.rkey
	};
	await putLocal(entry);
	return entry;
}
