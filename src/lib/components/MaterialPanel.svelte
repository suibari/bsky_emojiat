<script lang="ts">
	import { localized, t } from '$lib/i18n/index.svelte';
	import { FONTS } from '$lib/render/fonts';
	import { ASPECTS, GRADIENTS, SOLID_COLORS, type Recipe } from '$lib/render/recipe';
	import ImagePanel from './ImagePanel.svelte';

	let {
		recipe = $bindable(),
		onpick,
		ondraw,
		imageLoading = false,
		imageError = ''
	}: {
		recipe: Recipe;
		onpick: (file: File) => void;
		ondraw: () => void;
		imageLoading?: boolean;
		imageError?: string;
	} = $props();

	const isImage = $derived(recipe.source === 'image');

	const sample = $derived([...recipe.text.replace(/\s/g, '')].slice(0, 2).join('') || 'あ');
	const STROKE_COLORS = ['#ffffff', '#111418', '#1185fe', '#ffd21f', '#ff5fa8'];
	const BACKGROUNDS = ['#ffffff', '#111418', '#1185fe', '#ffd21f', '#ff5fa8'];

	const sameStops = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);
</script>

<div class="flex flex-col gap-6">
	<div class="seg w-full" role="group" aria-label={t('material.source')}>
		<button type="button" class="flex-1" aria-pressed={!isImage} onclick={() => (recipe.source = 'text')}>
			{t('material.fromText')}
		</button>
		<button type="button" class="flex-1" aria-pressed={isImage} onclick={() => (recipe.source = 'image')}>
			{t('material.fromImage')}
		</button>
	</div>

	{#if isImage}
		<ImagePanel bind:image={recipe.image} {onpick} {ondraw} loading={imageLoading} error={imageError} />
	{:else}
	<label class="flex flex-col gap-2">
		<span class="panel-label">{t('material.text')}</span>
		<textarea
			bind:value={recipe.text}
			rows="3"
			maxlength="64"
			autocomplete="off"
			spellcheck="false"
			class="field resize-none py-2 leading-6"
			style="height:auto"
			placeholder={t('material.textPlaceholder')}
		></textarea>
		<span class="text-[12px] leading-4 text-muted">{t('material.textHint')}</span>
	</label>
	{/if}

	<section class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<span class="panel-label">{t('material.aspect')}</span>
			<div class="seg" role="group" aria-label={t('material.aspect')}>
				{#each ASPECTS as a (a)}
					<button type="button" aria-pressed={recipe.aspect === a} onclick={() => (recipe.aspect = a)}>
						{a}:1
					</button>
				{/each}
			</div>
		</div>
	</section>

	{#if !isImage}
	<section class="flex flex-col gap-2">
		<span class="panel-label">{t('material.font')}</span>
		<div class="grid grid-cols-3 gap-2">
			{#each FONTS as f (f.id)}
				<button
					type="button"
					aria-pressed={recipe.font === f.id}
					onclick={() => (recipe.font = f.id)}
					class="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-deep transition-colors duration-150 hover:border-line-strong
						{recipe.font === f.id ? 'border-accent bg-accent-soft' : 'border-line'}"
				>
					<span class="text-[22px] leading-7 text-fg" style="font-family:'{f.family}';font-weight:{f.weight}">{sample}</span>
					<span class="text-[11px] leading-4 text-muted">{localized(f)}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<span class="panel-label">{t('material.color')}</span>
			<div class="seg" role="group" aria-label={t('material.color')}>
				<button
					type="button"
					aria-pressed={recipe.fill.kind === 'solid'}
					onclick={() => (recipe.fill = { kind: 'solid', color: SOLID_COLORS[0] })}>{t('material.solid')}</button
				>
				<button
					type="button"
					aria-pressed={recipe.fill.kind === 'gradient'}
					onclick={() => (recipe.fill = { kind: 'gradient', stops: GRADIENTS[0].stops })}>{t('material.gradient')}</button
				>
			</div>
		</div>
		{#if recipe.fill.kind === 'solid'}
			{@const current = recipe.fill.color}
			<div class="flex flex-wrap items-center gap-2">
				{#each SOLID_COLORS as c (c)}
					<button
						type="button"
						aria-label={c}
						aria-pressed={current === c}
						onclick={() => (recipe.fill = { kind: 'solid', color: c })}
						class="size-7 rounded-md border transition-[outline-color] {current === c ? 'outline-2 outline-offset-2 outline-accent' : 'outline-transparent'} border-line-strong"
						style="background:{c}"
					></button>
				{/each}
				<label class="relative size-7 overflow-hidden rounded-md border border-dashed border-line-strong" title={t('material.customColor')}>
					<input
						type="color"
						value={current}
						oninput={(e) => (recipe.fill = { kind: 'solid', color: e.currentTarget.value })}
						class="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
					<span class="pointer-events-none grid size-full place-items-center text-[14px] text-muted">+</span>
				</label>
			</div>
		{:else}
			{@const stops = recipe.fill.stops}
			<div class="grid grid-cols-4 gap-2">
				{#each GRADIENTS as g (g.id)}
					{@const active = sameStops(stops, g.stops)}
					<button
						type="button"
						aria-pressed={active}
						onclick={() => (recipe.fill = { kind: 'gradient', stops: g.stops })}
						class="flex flex-col items-center gap-1"
					>
						<span
							class="h-7 w-full rounded-md border border-line-strong {active ? 'outline-2 outline-offset-2 outline-accent' : ''}"
							style="background:linear-gradient(180deg,{g.stops.join(',')})"
						></span>
						<span class="text-[11px] leading-4 text-muted">{localized(g)}</span>
					</button>
				{/each}
			</div>
		{/if}
	</section>
	{/if}

	<section class="flex flex-col gap-3">
		<label class="flex items-center justify-between">
			<span class="panel-label">{t('material.stroke')}</span>
			<input type="checkbox" bind:checked={recipe.stroke.enabled} class="size-4 accent-accent" />
		</label>
		{#if recipe.stroke.enabled}
			<div class="flex items-center gap-2">
				{#each STROKE_COLORS as c (c)}
					<button
						type="button"
						aria-label={c}
						aria-pressed={recipe.stroke.color === c}
						onclick={() => (recipe.stroke.color = c)}
						class="size-7 rounded-md border border-line-strong {recipe.stroke.color === c ? 'outline-2 outline-offset-2 outline-accent' : ''}"
						style="background:{c}"
					></button>
				{/each}
				<label class="relative size-7 overflow-hidden rounded-md border border-dashed border-line-strong" title={t('material.customColor')}>
					<input type="color" bind:value={recipe.stroke.color} class="absolute inset-0 size-full cursor-pointer opacity-0" />
					<span class="pointer-events-none grid size-full place-items-center text-[14px] text-muted">+</span>
				</label>
			</div>
			<label class="flex items-center gap-3">
				<span class="w-16 text-[13px] text-fg2">{t('material.strokeWidth')}</span>
				<input type="range" min="1" max="16" step="1" bind:value={recipe.stroke.width} class="flex-1" />
				<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{recipe.stroke.width}</span>
			</label>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<span class="panel-label">{t('material.layout')}</span>
		{#if !isImage}
		<div class="flex gap-2">
			<label class="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-fg2">
				<input type="checkbox" bind:checked={recipe.italic} class="size-4 accent-accent" />
				{t('material.italic')}
			</label>
			<label class="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-fg2">
				<input type="checkbox" bind:checked={recipe.vertical} class="size-4 accent-accent" />
				{t('material.vertical')}
			</label>
		</div>
		<label class="flex items-center gap-3">
			<span class="w-16 text-[13px] text-fg2">{t('material.lineHeight')}</span>
			<input type="range" min="0.7" max="1.6" step="0.05" bind:value={recipe.lineHeight} class="flex-1" />
			<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{recipe.lineHeight.toFixed(2)}</span>
		</label>
		{/if}
		<label class="flex items-center gap-3">
			<span class="w-16 text-[13px] text-fg2">{t('material.padding')}</span>
			<input type="range" min="0" max="0.25" step="0.01" bind:value={recipe.padding} class="flex-1" />
			<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{Math.round(recipe.padding * 100)}%</span>
		</label>
	</section>

	<section class="flex flex-col gap-2">
		<span class="panel-label">{t('material.background')}</span>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				aria-label={t('material.transparent')}
				aria-pressed={recipe.background === null}
				onclick={() => (recipe.background = null)}
				class="checker size-7 rounded-md border border-line-strong {recipe.background === null ? 'outline-2 outline-offset-2 outline-accent' : ''}"
			></button>
			{#each BACKGROUNDS as c (c)}
				<button
					type="button"
					aria-label={c}
					aria-pressed={recipe.background === c}
					onclick={() => (recipe.background = c)}
					class="size-7 rounded-md border border-line-strong {recipe.background === c ? 'outline-2 outline-offset-2 outline-accent' : ''}"
					style="background:{c}"
				></button>
			{/each}
			<label class="relative size-7 overflow-hidden rounded-md border border-dashed border-line-strong" title={t('material.customColor')}>
				<input
					type="color"
					aria-label={t('material.customColor')}
					value={recipe.background ?? '#ffffff'}
					oninput={(e) => (recipe.background = e.currentTarget.value)}
					class="absolute inset-0 size-full cursor-pointer opacity-0"
				/>
				<span class="pointer-events-none grid size-full place-items-center text-[14px] text-muted">+</span>
			</label>
		</div>
	</section>
</div>
