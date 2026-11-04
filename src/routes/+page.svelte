<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowUpRight, Download } from 'lucide-svelte';
	import EmojiCanvas from '$lib/components/EmojiCanvas.svelte';
	import MaterialPanel from '$lib/components/MaterialPanel.svelte';
	import EffectPanel from '$lib/components/EffectPanel.svelte';
	import ChatMock from '$lib/components/ChatMock.svelte';
	import { defaultRecipe, emojiSize, isAnimated, normalizeRecipe, type Recipe } from '$lib/render/recipe';
	import { MAX_EMOJI_BYTES, encodeEmoji, type Encoded } from '$lib/render/encode';
	import { EMOJI_NAME_PATTERN, altOf, saveEmoji } from '$lib/atproto/bluemoji';
	import { session } from '$lib/atproto/session.svelte';
	import { rememberEmoji } from '$lib/store/history';
	import { getLocal } from '$lib/store/local';
	import { NAGI_URL } from '$lib/nagi';

	// 編集できるのはブラウザ保存の絵文字だけ。PDS の絵文字は Nagi の投稿から CID で参照されるので上書きしない
	type Editing = { kind: 'local'; id: string; createdAt: string } | null;

	const defaultName = () => {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return `emoji_${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
	};

	let recipe: Recipe = $state(defaultRecipe());
	let name = $state(defaultName());
	let editing: Editing = $state(null);
	let tab: 'material' | 'effect' = $state('material');
	let busy: 'download' | 'save' | null = $state(null);
	let progress = $state(0);
	let notice: { kind: 'ok' | 'error'; text: string; nagi?: boolean } | null = $state(null);
	let stageWidth = $state(0);

	const nameValid = $derived(EMOJI_NAME_PATTERN.test(name));
	const size = $derived(emojiSize(recipe.aspect));
	const animated = $derived(isAnimated(recipe));
	// 画面幅に合わせて大きく見せる。高さ 128 の倍率で表示する
	const stageHeight = $derived(
		Math.max(64, Math.min(256, stageWidth ? Math.floor((stageWidth - 48) / recipe.aspect) : 192))
	);

	onMount(async () => {
		const localId = page.url.searchParams.get('local');
		if (localId) {
			const item = await getLocal(localId);
			if (item) {
				recipe = normalizeRecipe(item.recipe);
				name = item.name;
				editing = { kind: 'local', id: item.id, createdAt: item.createdAt };
			}
		}
	});

	function startNew() {
		recipe = defaultRecipe();
		name = defaultName();
		editing = null;
		notice = null;
		void goto('/', { replaceState: true });
	}

	async function encode(): Promise<Encoded | null> {
		progress = 0;
		const result = await encodeEmoji($state.snapshot(recipe) as Recipe, (p) => (progress = p));
		if (result.tooLarge) {
			notice = {
				kind: 'error',
				text: t('editor.tooLarge', { size: Math.round(result.blob.size / 1024), max: MAX_EMOJI_BYTES / 1024 })
			};
			return null;
		}
		return result;
	}

	/**
	 * ダウンロードや PDS 保存をしたら、レシピと画像をこのブラウザの履歴に残す。
	 * PDS の絵文字は編集しないので、あとから作り直せるのはこの履歴だけ。
	 */
	async function remember(r: Encoded, rkey?: string) {
		try {
			const entry = await rememberEmoji({
				id: editing?.id,
				name: nameValid ? name : 'emoji',
				recipe: $state.snapshot(recipe) as Recipe,
				encoded: r,
				rkey
			});
			editing = { kind: 'local', id: entry.id, createdAt: entry.createdAt };
			void goto(`/?local=${entry.id}`, { replaceState: true, keepFocus: true, noScroll: true });
		} catch {
			// 履歴に残せなくても（プライベートブラウズ等）ダウンロード・保存自体は成功している
		}
	}

	async function download() {
		busy = 'download';
		notice = null;
		try {
			const r = await encode();
			if (!r) return;
			void remember(r);
			const url = URL.createObjectURL(r.blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${nameValid ? name : 'emoji'}.${r.blob.type === 'image/gif' ? 'gif' : 'png'}`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (e) {
			notice = { kind: 'error', text: e instanceof Error ? e.message : String(e) };
		} finally {
			busy = null;
		}
	}

	async function save() {
		if (!nameValid) return;
		busy = 'save';
		notice = null;
		try {
			const r = await encode();
			if (!r) return;
			const agent = session.agent;
			if (!agent) return;
			const saved = await saveEmoji(agent, { name, alt: altOf($state.snapshot(recipe) as Recipe), blob: r.blob });
			await remember(r, saved.rkey);
			notice = { kind: 'ok', text: t('editor.savedPds', { name }), nagi: true };
		} catch (e) {
			notice = { kind: 'error', text: e instanceof Error ? e.message : String(e) };
		} finally {
			busy = null;
		}
	}
</script>

<div class="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[320px_minmax(0,1fr)_340px] lg:gap-6">
	<!-- プレビュー（スマホでは先頭） -->
	<section class="flex flex-col gap-4 lg:order-2" aria-label={t('editor.preview')}>
		<div class="flex items-center justify-between">
			<h1 class="text-[16px] font-medium">
				{editing ? t('editor.edit') : t('editor.new')}
			</h1>
			{#if editing}
				<button type="button" class="btn btn-ghost btn-sm" onclick={startNew}>{t('editor.startNew')}</button>
			{/if}
		</div>
		<div
			bind:clientWidth={stageWidth}
			class="checker grid min-h-[208px] place-items-center rounded-2xl border border-line p-6 lg:min-h-[320px]"
		>
			<EmojiCanvas {recipe} height={stageHeight} />
		</div>
		<div class="flex items-center justify-between font-mono text-[12px] text-muted">
			<span>{animated ? 'GIF' : 'PNG'} · {size.width}×{size.height}</span>
			<span>{t('editor.limit', { kb: MAX_EMOJI_BYTES / 1024 })}</span>
		</div>
		<ChatMock {recipe} name={nameValid ? name : 'emoji'} />
	</section>

	<!-- スマホ用の切替 -->
	<div class="seg w-full lg:hidden" role="group" aria-label={t('editor.tabMaterial')}>
		<button type="button" class="flex-1" aria-pressed={tab === 'material'} onclick={() => (tab = 'material')}>{t('editor.tabMaterial')}</button>
		<button type="button" class="flex-1" aria-pressed={tab === 'effect'} onclick={() => (tab = 'effect')}>
			{t('editor.tabEffect')}{recipe.effects.length ? ` ${recipe.effects.length}` : ''}
		</button>
	</div>

	<section
		class="rounded-2xl border border-line bg-card p-4 lg:order-1 lg:block lg:max-h-[calc(100dvh-56px-48px-72px)] lg:overflow-y-auto {tab === 'material' ? '' : 'hidden'}"
		aria-label={t('editor.tabMaterial')}
	>
		<MaterialPanel bind:recipe />
	</section>

	<section
		class="rounded-2xl border border-line bg-card p-4 lg:order-3 lg:block lg:max-h-[calc(100dvh-56px-48px-72px)] lg:overflow-y-auto {tab === 'effect' ? '' : 'hidden'}"
		aria-label={t('editor.tabEffect')}
	>
		<EffectPanel bind:recipe />
	</section>
</div>

<!-- 保存バー -->
<div class="sticky bottom-0 z-20 border-t border-line bg-bg">
	{#if notice}
		<div class="mx-auto flex max-w-[1600px] items-center gap-3 px-4 pt-3 md:px-6">
			<span class="size-2 shrink-0 rounded-full {notice.kind === 'ok' ? 'bg-ok' : 'bg-danger'}"></span>
			<p class="flex-1 text-[13px] text-fg2">{notice.text}</p>
			{#if notice.nagi}
				<a href={NAGI_URL} target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
					{t('editor.openNagi')} <ArrowUpRight size={16} strokeWidth={1.5} />
				</a>
			{/if}
		</div>
	{/if}
	<div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
		<label class="flex h-9 w-full items-center rounded-lg border bg-raised font-mono text-[14px] sm:w-auto {nameValid ? 'border-line' : 'border-danger'}">
			<span class="pl-3 text-muted">:</span>
			<input
				bind:value={name}
				maxlength="32"
				autocomplete="off"
				spellcheck="false"
				aria-label={t('editor.nameLabel')}
				class="h-full min-w-[8ch] flex-1 bg-transparent px-1 outline-none [field-sizing:content] sm:flex-none"
			/>
			<span class="pr-3 text-muted">:</span>
		</label>
		{#if !nameValid}
			<span class="text-[12px] text-danger">{t('editor.nameInvalid')}</span>
		{/if}
		<div class="ml-auto flex items-center gap-2">
			<!-- 未ログインならダウンロードが主操作。ログイン中は PDS 保存が主操作 -->
			<button
				type="button"
				class="btn {session.oauth ? 'btn-secondary' : 'btn-primary'}"
				onclick={download}
				disabled={busy !== null}
			>
				<Download size={16} strokeWidth={1.5} />
				{busy === 'download' ? t('editor.exporting', { p: Math.round(progress * 100) }) : t('editor.download')}
			</button>
			{#if session.oauth}
				<button type="button" class="btn btn-primary" onclick={save} disabled={busy !== null || !nameValid}>
					{busy === 'save' ? t('editor.saving', { p: Math.round(progress * 100) }) : t('editor.savePds')}
				</button>
			{/if}
		</div>
	</div>
</div>
