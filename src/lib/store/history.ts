import type { Encoded } from '$lib/render/encode';
import type { Recipe } from '$lib/render/recipe';
import { getLocal, newLocalId, putLocal, type LocalEmoji } from './local';

/**
 * ダウンロード・PDS 保存のたびに、作った絵文字をブラウザの履歴へ残す（上書き or 追加）。
 * 履歴から開いて直したものは同じ項目を上書きするので、何度書き出しても増えない。
 *
 * rkey は「この内容が PDS にある」印。今回 PDS に保存したならその rkey、ダウンロードだけなら
 * 前回 PDS に保存した内容から変わっていないときだけ印を引き継ぐ。
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
	const unchanged =
		prev !== undefined && prev.name === input.name && JSON.stringify(prev.recipe) === JSON.stringify(input.recipe);
	const entry: LocalEmoji = {
		id: prev?.id ?? newLocalId(),
		name: input.name,
		recipe: input.recipe,
		blob: input.encoded.blob,
		width: input.encoded.width,
		height: input.encoded.height,
		createdAt: prev?.createdAt ?? now,
		updatedAt: now,
		rkey: input.rkey ?? (unchanged ? prev.rkey : undefined)
	};
	await putLocal(entry);
	return entry;
}
