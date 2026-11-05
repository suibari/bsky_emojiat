import type { Agent } from '@atproto/api';
import type { Recipe } from '$lib/render/recipe';

/**
 * Nagi と同じ Bluemoji 形式（blue.moji.collection.item）で保存する。
 * 書式は nagi_client/src/lib/atproto/bluemoji.ts の createBluemojiItem に合わせてあり、
 * ここで作った絵文字はそのまま Nagi の絵文字ピッカーに出る。
 * 作り方の設定（レシピ）は PDS に置かない。PDS の絵文字は作成と削除だけで、編集はしない。
 */
export const BLUEMOJI_ITEM = 'blue.moji.collection.item';
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

/** 代替テキスト。画像から作った絵文字は文字を持たないので名前を使う。 */
export const altOf = (recipe: Recipe, name: string) =>
	(recipe.source === 'image' ? '' : recipe.text.replace(/\s+/g, ' ').trim().slice(0, 100)) || name;

async function pdsUrl(agent: Agent) {
	const session = (agent as unknown as { sessionManager: { getTokenInfo?: () => Promise<{ aud: string }> } })
		.sessionManager;
	const info = await session.getTokenInfo?.();
	if (!info) throw new Error('PDS URL is unavailable');
	return info.aud.replace(/\/$/, '');
}

/**
 * PDS への保存は常に新規作成。Nagi は投稿やリアクションで絵文字をレコードの CID（と画像 blob の CID）
 * まで固定して参照するため、同じ rkey に上書きすると過去の投稿の絵文字が表示できなくなる。
 */
export async function saveEmoji(agent: Agent, opts: { name: string; alt: string; blob: Blob }) {
	const did = agent.assertDid;
	const uploaded = await agent.com.atproto.repo.uploadBlob(opts.blob, { encoding: opts.blob.type });
	const rkey = createRkey();
	const item = buildItemRecord({
		name: opts.name,
		alt: opts.alt,
		blob: uploaded.data.blob,
		mimeType: opts.blob.type,
		createdAt: new Date().toISOString()
	});
	await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: BLUEMOJI_ITEM,
		rkey,
		record: item,
		validate: false
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
	const [pds, items] = await Promise.all([pdsUrl(agent), listAll(agent, BLUEMOJI_ITEM)]);
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
		out.push({
			rkey: rkeyOf(record.uri),
			uri: record.uri,
			name: v.name,
			alt: typeof v.alt === 'string' ? v.alt : undefined,
			url: `${pds}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did, cid: media.cid })}`,
			mimeType: media.mimeType,
			createdAt: typeof v.createdAt === 'string' ? v.createdAt : ''
		});
	}
	return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const isNotFound = (e: unknown) =>
	(e as { error?: string })?.error === 'RecordNotFound' ||
	String((e as { message?: string })?.message ?? '').includes('RecordNotFound');

export async function deleteEmoji(agent: Agent, rkey: string) {
	try {
		await agent.com.atproto.repo.deleteRecord({ repo: agent.assertDid, collection: BLUEMOJI_ITEM, rkey });
	} catch (e) {
		if (!isNotFound(e)) throw e;
	}
}
