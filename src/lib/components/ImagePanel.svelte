<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { ImagePlus, Crosshair, Pencil } from 'lucide-svelte';
	import type { ImageSource } from '$lib/render/recipe';

	let {
		image = $bindable(),
		onpick,
		ondraw,
		loading = false,
		error = ''
	}: {
		image: ImageSource | null;
		onpick: (file: File) => void;
		ondraw: () => void;
		loading?: boolean;
		error?: string;
	} = $props();

	let input: HTMLInputElement | undefined = $state();
	let over = $state(false);
	let natural: { w: number; h: number } | null = $state(null);

	function choose(files: FileList | null | undefined) {
		const file = files?.[0];
		if (file) onpick(file);
	}
</script>

<div class="flex flex-col gap-6">
	<input
		bind:this={input}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/gif"
		class="hidden"
		onchange={(e) => {
			choose(e.currentTarget.files);
			e.currentTarget.value = '';
		}}
	/>

	{#if !image}
		<button
			type="button"
			onclick={() => input?.click()}
			ondragover={(e) => {
				e.preventDefault();
				over = true;
			}}
			ondragleave={() => (over = false)}
			ondrop={(e) => {
				e.preventDefault();
				over = false;
				choose(e.dataTransfer?.files);
			}}
			disabled={loading}
			class="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors duration-150
				{over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-deep hover:border-fg2'}"
		>
			<ImagePlus size={24} strokeWidth={1.5} class="text-fg2" />
			<span class="text-[14px] font-medium text-fg">{loading ? t('image.loading') : t('image.pick')}</span>
			<span class="flex flex-col gap-1">
				<span class="text-[12px] leading-4 text-muted">{t('image.pickHint')}</span>
				<span class="font-mono text-[11px] leading-4 text-muted">PNG · JPEG · WebP · GIF</span>
			</span>
		</button>
		<button type="button" class="btn btn-secondary" onclick={ondraw}>
			<Pencil size={16} strokeWidth={1.5} />
			{t('draw.start')}
		</button>
	{:else}
		<div class="flex items-center gap-3">
			<span class="checker grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line">
				<img
					src={image.src}
					alt=""
					class="max-h-full max-w-full object-contain"
					onload={(e) => {
						const el = e.currentTarget as HTMLImageElement;
						natural = { w: el.naturalWidth, h: el.naturalHeight };
					}}
				/>
			</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<span class="font-mono text-[12px] leading-4 tabular-nums text-muted">{natural ? `${natural.w}×${natural.h}` : ''}</span>
				<div class="flex gap-2">
					<button type="button" class="btn btn-secondary btn-sm flex-1 px-2" onclick={ondraw}>
						<Pencil size={16} strokeWidth={1.5} />
						{t('draw.over')}
					</button>
					<button type="button" class="btn btn-secondary btn-sm flex-1 px-2" onclick={() => input?.click()} disabled={loading}>
						{loading ? t('image.loading') : t('image.replace')}
					</button>
				</div>
			</div>
		</div>

		<section class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<span class="panel-label">{t('image.fit')}</span>
				<div class="seg" role="group" aria-label={t('image.fit')}>
					<button type="button" aria-pressed={image.fit === 'contain'} onclick={() => (image!.fit = 'contain')}>
						{t('image.contain')}
					</button>
					<button type="button" aria-pressed={image.fit === 'cover'} onclick={() => (image!.fit = 'cover')}>
						{t('image.cover')}
					</button>
				</div>
			</div>
			<label class="flex items-center gap-3">
				<span class="w-16 text-[13px] text-fg2">{t('image.zoom')}</span>
				<input type="range" min="0.5" max="4" step="0.05" bind:value={image.zoom} class="flex-1" />
				<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{Math.round(image.zoom * 100)}%</span>
			</label>
			<div class="flex items-center gap-3">
				<p class="flex-1 text-[12px] leading-4 text-muted">{t('image.dragHint')}</p>
				<button
					type="button"
					class="btn btn-ghost btn-sm px-2"
					disabled={image.x === 0 && image.y === 0 && image.zoom === 1}
					onclick={() => {
						image!.x = 0;
						image!.y = 0;
						image!.zoom = 1;
					}}
				>
					<Crosshair size={16} strokeWidth={1.5} />
					{t('image.recenter')}
				</button>
			</div>
		</section>

		<section class="flex flex-col gap-3">
			<label class="flex items-center justify-between">
				<span class="panel-label">{t('image.removeBg')}</span>
				<input type="checkbox" bind:checked={image.removeBg} class="size-4 accent-accent" />
			</label>
			{#if image.removeBg}
				<label class="flex items-center gap-3">
					<span class="w-16 text-[13px] text-fg2">{t('image.tolerance')}</span>
					<input type="range" min="0" max="0.5" step="0.01" bind:value={image.tolerance} class="flex-1" />
					<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{Math.round(image.tolerance * 100)}</span>
				</label>
				<p class="text-[12px] leading-4 text-muted">{t('image.removeBgHint')}</p>
			{/if}
		</section>
	{/if}

	{#if error}
		<p class="text-[12px] leading-4 text-danger">{error}</p>
	{/if}
</div>
