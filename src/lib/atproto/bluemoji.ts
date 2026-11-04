import type { Agent } from '@atproto/api';
import { normalizeRecipe, type Recipe } from '$lib/render/recipe';

/**
 * Nagi と同じ Bluemoji 形式（blue.moji.collection.item）で保存する。
 * 書式は nagi_client/src/lib/atproto/bluemoji.ts の createBluemojiItem に合わせてあり、
 * ここで作った絵文字はそのまま Nagi の絵文字ピッカーに出る。
 */
export const BLUEMOJI_ITEM = 'blue.moji.collection.item';
/** 編集用にレシピを置くサイドカー。本体と同じ rkey を使う。 */
export const EMOJIAT_RECIPE = 'com.suibari.emojiat.recipe';
const FORMATS_V0 = `${BLUEMOJI_ITEM}#formats_v0`;
export const EMOJI_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

const FORMAT_KEY: Record<string, string> = {
	'image/png': 'png_128',
	'image/webp': 'webp_128',
	'image/gif': 'gif_128'
};

export type PdsEmoji = {
	rkey: string;
	uri: string;
	name: string;
	alt?: string;
	url: string;
	mimeType: string;
	recipe?: Recipe;
	createdAt: string;
};

export const createRkey = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return `emojiat_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};

export const displayName = (name: string) => name.replace(/^:|:$/g, '');

/**
 * blob 参照の CID を取り出す。生の JSON では `ref.$link` だが、@atproto/api 経由で読むと
 * `ref` が CID オブジェクトに変換されて返ってくるので、両方に対応する。
 */
export function blobInfo(raw: unknown): { cid: string; mimeType: string } | undefined {
	const b = raw as { ref?: unknown; mimeType?: unknown } | undefined;
	if (!b || typeof b.mimeType !== 'string' || !b.ref) return undefined;
	const ref = b.ref as { $link?: unknown; toString(): string };
	const cid = typeof ref.$link === 'string' ? ref.$link : ref.toString();
	if (!cid || cid === '[object Object]') return undefined;
	return { cid, mimeType: b.mimeType };
}

/** blue.moji.collection.item の値。Nagi の fetchMyBluemoji の検証を通る形にする。 */
export function buildItemRecord(input: {
	name: string;
	alt: string;
	blob: unknown;
	mimeType: string;
	createdAt: string;
}) {
	const key = FORMAT_KEY[input.mimeType];
	if (!key) throw new Error(`Unsupported mime type: ${input.mimeType}`);
	return {
		$type: BLUEMOJI_ITEM,
		name: `:${input.name}:`,
		...(input.alt ? { alt: input.alt } : {}),
		adultOnly: false,
		fallbackText: '◌',
		createdAt: input.createdAt,
		formats: { $type: FORMATS_V0, [key]: input.blob }
	};
}

export function buildRecipeRecord(did: string, rkey: string, recipe: Recipe, createdAt: string) {
	return {
		$type: EMOJIAT_RECIPE,
		subject: `at://${did}/${BLUEMOJI_ITEM}/${rkey}`,
		recipe,
		createdAt
	};
}

export const altOf = (recipe: Recipe) => recipe.text.replace(/\s+/g, ' ').trim().slice(0, 100);

async function pdsUrl(agent: Agent) {
	const session = (agent as unknown as { sessionManager: { getTokenInfo?: () => Promise<{ aud: string }> } })
		.sessionManager;
	const info = await session.getTokenInfo?.();
	if (!info) throw new Error('PDS URL is unavailable');
	return info.aud.replace(/\/$/, '');
}

/** 新規保存（mode=create）と、既存 rkey の上書き（mode=update）。 */
export async function saveEmoji(
	agent: Agent,
	opts: { name: string; recipe: Recipe; blob: Blob; rkey?: string; createdAt?: string }
) {
	const did = agent.assertDid;
	const uploaded = await agent.com.atproto.repo.uploadBlob(opts.blob, { encoding: opts.blob.type });
	const now = new Date().toISOString();
	const rkey = opts.rkey ?? createRkey();
	const createdAt = opts.createdAt ?? now;
	const item = buildItemRecord({
		name: opts.name,
		alt: altOf(opts.recipe),
		blob: uploaded.data.blob,
		mimeType: opts.blob.type,
		createdAt
	});
	const recipe = buildRecipeRecord(did, rkey, opts.recipe, createdAt);
	const op = opts.rkey ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create';
	let recipeOp = op;
	if (opts.rkey) {
		// 他アプリ製の絵文字を初めて編集する場合など、サイドカーがまだ無いこともある
		try {
			await agent.com.atproto.repo.getRecord({ repo: did, collection: EMOJIAT_RECIPE, rkey });
		} catch {
			recipeOp = 'com.atproto.repo.applyWrites#create';
		}
	}
	await agent.com.atproto.repo.applyWrites({
		repo: did,
		validate: false,
		writes: [
			{ $type: op, collection: BLUEMOJI_ITEM, rkey, value: item },
			{ $type: recipeOp, collection: EMOJIAT_RECIPE, rkey, value: recipe }
		] as never
	});
	return { rkey, uri: `at://${did}/${BLUEMOJI_ITEM}/${rkey}` };
}

async function listAll(agent: Agent, collection: string) {
	const out: { uri: string; value: Record<string, unknown> }[] = [];
	let cursor: string | undefined;
	do {
		const res = await agent.com.atproto.repo.listRecords({
			repo: agent.assertDid,
			collection,
			limit: 100,
			cursor
		});
		out.push(...(res.data.records as { uri: string; value: Record<string, unknown> }[]));
		cursor = res.data.cursor;
	} while (cursor);
	return out;
}

const rkeyOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

export async function listEmojis(agent: Agent): Promise<PdsEmoji[]> {
	const did = agent.assertDid;
	const [pds, items, recipes] = await Promise.all([
		pdsUrl(agent),
		listAll(agent, BLUEMOJI_ITEM),
		listAll(agent, EMOJIAT_RECIPE)
	]);
	const recipeByRkey = new Map(recipes.map((r) => [rkeyOf(r.uri), r.value.recipe]));
	const out: PdsEmoji[] = [];
	for (const record of items) {
		const v = record.value as {
			name?: unknown;
			alt?: unknown;
			createdAt?: unknown;
			formats?: Record<string, unknown>;
		};
		if (typeof v.name !== 'string' || !v.formats) continue;
		let media: { cid: string; mimeType: string } | undefined;
		for (const key of ['gif_128', 'webp_128', 'png_128', 'original']) {
			media = blobInfo(v.formats[key]);
			if (media) break;
		}
		if (!media) continue;
		const rkey = rkeyOf(record.uri);
		const rawRecipe = recipeByRkey.get(rkey);
		out.push({
			rkey,
			uri: record.uri,
			name: v.name,
			alt: typeof v.alt === 'string' ? v.alt : undefined,
			url: `${pds}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did, cid: media.cid })}`,
			mimeType: media.mimeType,
			recipe: rawRecipe ? normalizeRecipe(rawRecipe) : undefined,
			createdAt: typeof v.createdAt === 'string' ? v.createdAt : ''
		});
	}
	return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmoji(agent: Agent, rkey: string) {
	return (await listEmojis(agent)).find((e) => e.rkey === rkey);
}

const isNotFound = (e: unknown) =>
	(e as { error?: string })?.error === 'RecordNotFound' ||
	String((e as { message?: string })?.message ?? '').includes('RecordNotFound');

export async function deleteEmoji(agent: Agent, rkey: string) {
	const repo = agent.assertDid;
	for (const collection of [BLUEMOJI_ITEM, EMOJIAT_RECIPE]) {
		try {
			await agent.com.atproto.repo.deleteRecord({ repo, collection, rkey });
		} catch (e) {
			if (!isNotFound(e)) throw e;
		}
	}
}
