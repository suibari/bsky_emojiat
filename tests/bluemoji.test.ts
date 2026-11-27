import { describe, expect, it, vi } from 'vitest';
import { jsonToLex, type Agent } from '@atproto/api';
import { BLUEMOJI_ITEM, MAX_EMOJI_BYTES, altOf, blobInfo, buildItemRecord, createRkey, downloadEmoji, listEmojis, saveEmoji } from '../src/lib/atproto/bluemoji';
import { defaultImage, defaultRecipe, normalizeRecipe } from '../src/lib/render/recipe';

const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const blob = { $type: 'blob', ref: { $link: cid }, mimeType: 'image/gif', size: 1234 };
// 1×1 pixel, two frames.
const apng = Uint8Array.from(Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAGQD6AAAs35jzQAAAAxJREFUeJxj+M/AAAADAQEAyf6S7wAAABpmY1RMAAAAAQAAAAEAAAABAAAAAAAAAAAAZAPoAAAoDYkZAAAAEGZkQVQAAAACeJxjYGD4DwABAwEAaL/t9AAAAABJRU5ErkJggg==',
	'base64'
));

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
			formats: { $type: `${BLUEMOJI_ITEM}#formats_v1`, gif_128: blob }
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

describe('saveEmoji', () => {
	it('uploads a GIF in the v1 GIF slot', async () => {
		const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
		const image = new Blob([gif], { type: 'image/gif' });
		const uploaded = { ...blob, mimeType: image.type, size: image.size };
		const uploadBlob = vi.fn().mockResolvedValue({ data: { blob: uploaded } });
		const createRecord = vi.fn();
		const agent = { assertDid: 'did:plc:example', com: { atproto: { repo: { uploadBlob, createRecord } } } };
		await saveEmoji(agent as unknown as Agent, { name: 'dot', alt: '', blob: image });
		expect(uploadBlob).toHaveBeenCalledWith(image, { encoding: 'image/gif' });
		expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
			record: expect.objectContaining({
				formats: { $type: `${BLUEMOJI_ITEM}#formats_v1`, gif_128: uploaded }
			})
		}));
	});

	it('rejects data above the v1 slot limit before uploading it', async () => {
		const uploadBlob = vi.fn();
		const agent = { com: { atproto: { repo: { uploadBlob } } } };
		const image = new Blob([new Uint8Array(MAX_EMOJI_BYTES + 1)], { type: 'image/gif' });
		await expect(saveEmoji(agent as unknown as Parameters<typeof saveEmoji>[0], {
			name: 'large', alt: '', blob: image
		})).rejects.toThrow('format limit');
		expect(uploadBlob).not.toHaveBeenCalled();
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
		expect(altOf({ ...defaultRecipe(), text: 'ありが\nとう' }, 'x')).toBe('ありが とう');
		expect(altOf({ ...defaultRecipe(), source: 'image', image: defaultImage('data:image/png;base64,') }, 'cat')).toBe('cat');
	});
});

describe('blobInfo', () => {
	it('reads raw JSON refs', () => {
		expect(blobInfo(blob)).toEqual({ cid, mimeType: 'image/gif', size: blob.size });
	});
	it('reads BlobRefs and CID objects decoded by @atproto/api', () => {
		const decoded = jsonToLex({ $link: cid });
		const expected = { cid, mimeType: 'image/gif', size: blob.size };
		expect(blobInfo(jsonToLex(blob))).toEqual(expected);
		expect(blobInfo({ ...blob, ref: decoded })).toEqual(expected);
	});
	it('rejects missing refs', () => {
		expect(blobInfo({ mimeType: 'image/png' })).toBeUndefined();
		expect(blobInfo({ ref: {}, mimeType: 'image/png' })).toBeUndefined();
	});
});

describe('listEmojis', () => {
	it('prefers the v1 APNG and retains larger v0 GIFs and original raster images', async () => {
		const did = 'did:plc:example';
		const formatsList = [
			{ $type: `${BLUEMOJI_ITEM}#formats_v1`, gif_128: blob, apng_128: { ...blob, mimeType: 'image/png', size: apng.length } },
			{ $type: `${BLUEMOJI_ITEM}#formats_v0`, gif_128: { ...blob, size: 200_000 } },
			{ $type: `${BLUEMOJI_ITEM}#formats_v1`, original: { ...blob, mimeType: 'image/jpeg', size: 200_000 } },
			{ $type: `${BLUEMOJI_ITEM}#formats_v1`, lottie: { ...blob, mimeType: 'application/lottie+zip' }, png_128: { ...blob, mimeType: 'image/png' } }
		];
		const records = formatsList.map((formats, index) => ({
			uri: `at://${did}/${BLUEMOJI_ITEM}/emoji${index}`,
			value: { name: `:emoji${index}:`, formats }
		}));
		const listRecords = vi.fn().mockResolvedValue({ data: { records } });
		const agent = {
			assertDid: did,
			sessionManager: { getTokenInfo: async () => ({ aud: 'https://pds.example' }) },
			com: { atproto: { repo: { listRecords } } }
		};
		const emojis = await listEmojis(agent as unknown as Agent);
		expect(emojis.map(({ mimeType, size }) => [mimeType, size])).toEqual([
			['image/png', apng.length], ['image/gif', 200_000], ['image/jpeg', 200_000], ['image/png', blob.size]
		]);
		expect(emojis[0].url).toBe(`https://pds.example/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did, cid })}`);
	});
});

describe('downloadEmoji', () => {
	it('preserves the bytes and extension of an APNG streamed without Content-Length', async () => {
		const parts = [apng.subarray(0, 20), apng.subarray(20)];
		const body = new ReadableStream({
			start(controller) {
				for (const part of parts) controller.enqueue(part);
				controller.close();
			}
		});
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
		try {
			const result = await downloadEmoji({
				url: 'https://pds.example/blob', mimeType: 'image/apng', size: apng.length, name: ':dot:'
			});
			expect(result.filename).toBe('dot.png');
			expect(result.blob.type).toBe('image/apng');
			expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(apng);
		} finally {
			fetch.mockRestore();
		}
	});
});
