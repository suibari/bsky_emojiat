<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';
	import { ArrowUpRight, Download, Pencil, Trash2, Upload } from 'lucide-svelte';
	import { altOf, deleteEmoji, displayName, listEmojis, saveEmoji, type PdsEmoji } from '$lib/atproto/bluemoji';
	import { session } from '$lib/atproto/session.svelte';
	import { deleteLocal, listLocal, putLocal, type LocalEmoji } from '$lib/store/local';
	import { NAGI_URL } from '$lib/nagi';

	let local: (LocalEmoji & { url: string })[] = $state([]);
	let pds: PdsEmoji[] = $state([]);
	let pdsState: 'idle' | 'loading' | 'error' = $state('idle');
	let pdsError = $state('');
	let confirming: string | null = $state(null);
	let working: string | null = $state(null);

	async function loadLocal() {
		for (const item of local) URL.revokeObjectURL(item.url);
		local = (await listLocal()).map((e) => ({ ...e, url: URL.createObjectURL(e.blob) }));
	}

	async function loadPds() {
		const agent = session.agent;
		if (!agent) return;
		pdsState = 'loading';
		try {
			pds = await listEmojis(agent);
			pdsState = 'idle';
		} catch (e) {
			pdsError = e instanceof Error ? e.message : String(e);
			pdsState = 'error';
		}
	}

	onMount(() => {
		void loadLocal();
		return () => local.forEach((item) => URL.revokeObjectURL(item.url));
	});

	$effect(() => {
		if (session.oauth) void loadPds();
		else pds = [];
	});

	function downloadBlob(url: string, filename: string) {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
	}

	async function downloadPds(e: PdsEmoji) {
		const res = await fetch(e.url);
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		downloadBlob(url, `${displayName(e.name)}.${e.mimeType === 'image/gif' ? 'gif' : 'png'}`);
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function removeLocal(id: string) {
		working = id;
		try {
			await deleteLocal(id);
			await loadLocal();
		} finally {
			working = null;
			confirming = null;
		}
	}

	async function removePds(rkey: string) {
		const agent = session.agent;
		if (!agent) return;
		working = rkey;
		try {
			await deleteEmoji(agent, rkey);
			pds = pds.filter((e) => e.rkey !== rkey);
		} catch (e) {
			pdsError = e instanceof Error ? e.message : String(e);
			pdsState = 'error';
		} finally {
			working = null;
			confirming = null;
		}
	}

	async function moveToPds(item: LocalEmoji) {
		const agent = session.agent;
		if (!agent) return;
		working = item.id;
		try {
			const saved = await saveEmoji(agent, { name: item.name, alt: altOf(item.recipe), blob: item.blob });
			await putLocal({ ...$state.snapshot(item), rkey: saved.rkey } as LocalEmoji);
			await Promise.all([loadLocal(), loadPds()]);
		} catch (e) {
			pdsError = e instanceof Error ? e.message : String(e);
			pdsState = 'error';
		} finally {
			working = null;
		}
	}
</script>

<svelte:head><title>{t('library.title')} · {t('app.name')}</title></svelte:head>

<div class="mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-4 py-8 md:px-6">
	<section class="flex flex-col gap-4">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h1 class="flex items-baseline gap-2 text-[20px] font-medium">
				{t('library.pds')}
				{#if pds.length}<span class="font-mono text-[13px] font-normal text-muted">{pds.length}</span>{/if}
			</h1>
			{#if session.oauth}
				<a href={NAGI_URL} target="_blank" rel="noopener" class="flex items-center gap-1 text-[13px] text-fg2 hover:text-fg">
					{t('nav.useInNagi')} <ArrowUpRight size={16} strokeWidth={1.5} />
				</a>
			{/if}
		</div>
		{#if !session.ready}
			<p class="text-[13px] text-muted">{t('library.loading')}</p>
		{:else if !session.oauth}
			<p class="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] leading-5 text-fg2">
				{t('library.loginHint')}
			</p>
		{:else}
			{#if pdsState === 'error'}
				<p class="text-[13px] text-danger">{pdsError}</p>
			{/if}
			{#if pdsState === 'loading' && pds.length === 0}
				<p class="text-[13px] text-muted">{t('library.loading')}</p>
			{:else if pds.length === 0}
				<p class="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-fg2">
					{t('library.emptyBefore')}<a href="/" class="text-accent hover:underline">{t('library.emptyLink')}</a>{t('library.emptyAfter')}
				</p>
			{:else}
				<ul class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
					{#each pds as e (e.rkey)}
						<li class="flex flex-col gap-3 rounded-xl border border-line bg-card p-3">
							<div class="checker grid h-24 place-items-center rounded-lg p-2">
								<img src={e.url} alt={e.alt ?? displayName(e.name)} class="max-h-16 max-w-full object-contain" loading="lazy" />
							</div>
							<div class="flex min-w-0 flex-col">
								<span class="truncate font-mono text-[13px]">{e.name}</span>
								<span class="font-mono text-[12px] text-muted">{e.mimeType.replace('image/', '').toUpperCase()}</span>
							</div>
							<div class="flex items-center gap-1">
								<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('library.download')} onclick={() => downloadPds(e)}>
									<Download size={16} strokeWidth={1.5} />
								</button>
								{#if confirming === e.rkey}
									<button type="button" class="btn btn-sm bg-danger/15 px-2 text-danger" disabled={working === e.rkey} onclick={() => removePds(e.rkey)}>
										{t('library.confirmDelete')}
									</button>
								{:else}
									<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('library.delete')} onclick={() => (confirming = e.rkey)}>
										<Trash2 size={16} strokeWidth={1.5} />
									</button>
								{/if}
							</div>
							{#if confirming === e.rkey}
								<p class="text-[12px] leading-4 text-muted">{t('library.deletePdsNote')}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<section class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-[20px] font-medium">{t('library.local')}</h2>
			<p class="text-[13px] text-muted">{t('library.localNote')}</p>
		</div>
		{#if local.length === 0}
			<p class="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-fg2">
				{t('library.localEmpty')}
			</p>
		{:else}
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
				{#each local as e (e.id)}
					<li class="flex flex-col gap-3 rounded-xl border border-line bg-card p-3">
						<div class="checker grid h-24 place-items-center rounded-lg p-2">
							<img src={e.url} alt={e.recipe.text} class="max-h-16 max-w-full object-contain" />
						</div>
						<div class="flex min-w-0 flex-col">
							<span class="truncate font-mono text-[13px]">:{e.name}:</span>
							<span class="font-mono text-[12px] text-muted">
								{e.blob.type === 'image/gif' ? 'GIF' : 'PNG'} · {Math.round(e.blob.size / 1024)}KB{e.rkey ? ` · ${t('library.inPds')}` : ''}
							</span>
						</div>
						<div class="flex items-center gap-1">
							<a href="/?local={e.id}" class="btn btn-secondary btn-sm flex-1"><Pencil size={16} strokeWidth={1.5} />{t('library.edit')}</a>
							{#if session.oauth && !e.rkey}
								<button
									type="button"
									class="btn btn-ghost btn-sm px-2"
									aria-label={t('library.toPds')}
									title={t('library.toPds')}
									disabled={working === e.id}
									onclick={() => moveToPds(e)}
								>
									<Upload size={16} strokeWidth={1.5} />
								</button>
							{/if}
							<button
								type="button"
								class="btn btn-ghost btn-sm px-2"
								aria-label={t('library.download')}
								onclick={() => downloadBlob(e.url, `${e.name}.${e.blob.type === 'image/gif' ? 'gif' : 'png'}`)}
							>
								<Download size={16} strokeWidth={1.5} />
							</button>
							{#if confirming === e.id}
								<button type="button" class="btn btn-sm bg-danger/15 px-2 text-danger" disabled={working === e.id} onclick={() => removeLocal(e.id)}>
									{t('library.confirmDelete')}
								</button>
							{:else}
								<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('library.delete')} onclick={() => (confirming = e.id)}>
									<Trash2 size={16} strokeWidth={1.5} />
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
