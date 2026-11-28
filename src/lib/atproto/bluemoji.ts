import { BlobRef, type Agent } from '@atproto/api';
import type { Recipe } from '$lib/render/recipe';

/**
 * Nagi と同じ Bluemoji 形式（blue.moji.collection.item）で保存する。
 * 書式は nagi_client/src/lib/atproto/bluemoji.ts の createBluemojiItem に合わせてあり、
 * ここで作った絵文字はそのまま Nagi の絵文字ピッカーに出る。
 * 作り方の設定（レシピ）は PDS に置かない。PDS の絵文字は作成と削除だけで、編集はしない。
 */
export const BLUEMOJI_ITEM = 'blue.moji.collection.item';
const FORMATS_V1 = `${BLUEMOJI_ITEM}#formats_v1`;
const FORMATS_V0 = `${BLUEMOJI_ITEM}#formats_v0`;
export const MAX_EMOJI_BYTES = 128_000;
const MAX_V0_EMOJI_BYTES = 262_144;
const MAX_ORIGINAL_BYTES = 1_000_000;
export const EMOJI_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

const INLINE_FORMATS: ReadonlyArray<readonly [string, readonly string[]]> = [
	['apng_128', ['image/apng', 'image/png']],
	['gif_128', ['image/gif']],
	['webp_128', ['image/webp']],
	['png_128', ['image/png']]
];

const EXTENSIONS = {
	'image/apng': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/avif': 'avif'
};

type ImageMimeType = keyof typeof EXTENSIONS;
type Media = { cid: string; mimeType: ImageMimeType; size: number };

export type PdsEmoji = {
	rkey: string;
	uri: string;
	name: string;
	alt?: string;
	url: string;
	mimeType: ImageMimeType;
	size: number;
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
export function blobInfo(raw: unknown): Media | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const { $type, ref, mimeType, size } = raw as { $type?: unknown; ref?: unknown; mimeType?: unknown; size?: unknown };
	if (!(raw instanceof BlobRef) && $type !== 'blob') return undefined;
	if (typeof mimeType !== 'string' || !Object.hasOwn(EXTENSIONS, mimeType)) return undefined;
	if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) return undefined;
	if (!ref || typeof ref !== 'object') return undefined;
	const link = '$link' in ref ? ref.$link : undefined;
	try {
		const blob = BlobRef.asBlobRef(typeof link === 'string'
			? { cid: link, mimeType }
			: { $type: 'blob', ref, mimeType, size });
		if (blob) return { cid: blob.ref.toString(), mimeType: mimeType as ImageMimeType, size };
	} catch {
		return undefined;
	}
}

function uploadFormat(mimeType: string) {
	const match = INLINE_FORMATS.find(([key, types]) => key !== 'apng_128' && types.includes(mimeType));
	if (!match) throw new Error(`Unsupported mime type: ${mimeType}`);
	return match[0];
}

/** blue.moji.collection.item の値。Nagi の fetchMyBluemoji の検証を通る形にする。 */
export function buildItemRecord(input: {
	name: string;
	alt: string;
	blob: unknown;
	mimeType: string;
	createdAt: string;
}) {
	const key = uploadFormat(input.mimeType);
	return {
		$type: BLUEMOJI_ITEM,
		name: `:${input.name}:`,
		...(input.alt ? { alt: input.alt } : {}),
		adultOnly: false,
		fallbackText: '◌',
		createdAt: input.createdAt,
		formats: { $type: FORMATS_V1, [key]: input.blob }
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
	if (opts.blob.size > MAX_EMOJI_BYTES) throw new Error('Emoji exceeds the Bluemoji format limit');
	if (opts.blob.size === 0) throw new Error('Emoji image is empty');
	uploadFormat(opts.blob.type);
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
		if (typeof v?.name !== 'string' || !v.formats) continue;
		const media = selectMedia(v.formats);
		if (!media) continue;
		out.push({
			rkey: rkeyOf(record.uri),
			uri: record.uri,
			name: v.name,
			alt: typeof v.alt === 'string' ? v.alt : undefined,
			url: `${pds}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did, cid: media.cid })}`,
			mimeType: media.mimeType,
			size: media.size,
			createdAt: typeof v.createdAt === 'string' ? v.createdAt : ''
		});
	}
	return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function selectMedia(formats: Record<string, unknown>): Media | undefined {
	const version = formats.$type;
	// 旧レコードには formats の型タグを省略したものもある。
	const legacy = version === FORMATS_V0 || version === undefined;
	if (!legacy && version !== FORMATS_V1) return undefined;
	const limit = legacy ? MAX_V0_EMOJI_BYTES : MAX_EMOJI_BYTES;
	for (const [key, types] of INLINE_FORMATS) {
		if (legacy && key === 'apng_128') continue;
		const media = blobInfo(formats[key]);
		if (media && media.size <= limit && types.includes(media.mimeType)) return media;
	}
	const original = blobInfo(formats.original);
	if (original && original.size <= MAX_ORIGINAL_BYTES) return original;
}

export async function downloadEmoji(emoji: Pick<PdsEmoji, 'url' | 'mimeType' | 'size' | 'name'>) {
	const res = await fetch(emoji.url, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok || !res.body || Number(res.headers.get('content-length')) > emoji.size) {
		await res.body?.cancel();
		throw new Error('Unable to download emoji image');
	}
	const reader = res.body.getReader();
	const data = new Uint8Array(emoji.size);
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (size + value.byteLength > data.byteLength) {
				await reader.cancel();
				throw new Error('Emoji image exceeds its recorded size');
			}
			data.set(value, size);
			size += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	if (size !== data.byteLength) throw new Error('Emoji image does not match its recorded size');
	return {
		blob: new Blob([data], { type: emoji.mimeType }),
		filename: `${displayName(emoji.name)}.${EXTENSIONS[emoji.mimeType]}`
	};
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
