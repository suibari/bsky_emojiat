<script lang="ts">
	import { ArrowDown, ArrowUp, X } from 'lucide-svelte';
	import { CATEGORIES, EFFECTS, effectById, type CategoryId } from '$lib/render/effects';
	import type { Recipe } from '$lib/render/recipe';
	import EmojiCanvas from './EmojiCanvas.svelte';

	let { recipe = $bindable() }: { recipe: Recipe } = $props();

	let category: CategoryId = $state('move');
	let hovered: string | null = $state(null);

	// サムネイルは書体と色だけ反映した「あ」で見せる（入力のたびに作り直さない）
	const thumbBase = $derived({
		...recipe,
		text: [...recipe.text.replace(/\s/g, '')][0] ?? 'あ',
		aspect: 1 as const,
		vertical: false,
		padding: 0.18,
		background: null
	});

	const visible = $derived(EFFECTS.filter((e) => e.category === category));

	function toggle(id: string) {
		recipe.effects = recipe.effects.includes(id)
			? recipe.effects.filter((e) => e !== id)
			: [...recipe.effects, id].slice(0, 8);
	}
	function move(i: number, d: -1 | 1) {
		const next = [...recipe.effects];
		const j = i + d;
		if (j < 0 || j >= next.length) return;
		[next[i], next[j]] = [next[j], next[i]];
		recipe.effects = next;
	}
</script>

<div class="flex flex-col gap-6">
	<div class="grid grid-cols-6 gap-1" role="tablist" aria-label="エフェクトの種類">
		{#each CATEGORIES as c (c.id)}
			{@const count = recipe.effects.filter((id) => effectById(id)?.category === c.id).length}
			<button
				type="button"
				role="tab"
				aria-selected={category === c.id}
				onclick={() => (category = c.id)}
				class="flex h-8 items-center justify-center gap-1 rounded-lg text-[13px] transition-colors duration-150
					{category === c.id ? 'bg-raised text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]' : 'text-fg2 hover:text-fg'}"
			>
				{c.label}
				{#if count}<span class="font-mono text-[11px] text-accent">{count}</span>{/if}
			</button>
		{/each}
	</div>

	<div class="grid grid-cols-3 gap-2" role="tabpanel">
		{#each visible as e (e.id)}
			{@const order = recipe.effects.indexOf(e.id)}
			<button
				type="button"
				aria-pressed={order >= 0}
				title={e.description}
				onclick={() => toggle(e.id)}
				onpointerenter={() => (hovered = e.id)}
				onpointerleave={() => (hovered = null)}
				onfocus={() => (hovered = e.id)}
				onblur={() => (hovered = null)}
				class="relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors duration-150
					{order >= 0 ? 'border-accent bg-accent-soft' : 'border-line bg-deep hover:border-line-strong'}"
			>
				<span class="checker grid size-14 place-items-center overflow-hidden rounded-md">
					<EmojiCanvas
						recipe={{ ...thumbBase, effects: [e.id] }}
						height={48}
						playing={hovered === e.id || order >= 0}
					/>
				</span>
				<span class="text-[12px] leading-4 text-fg2">{e.label}</span>
				{#if order >= 0}
					<span class="absolute top-1 right-1 grid size-5 place-items-center rounded-md bg-accent-ink font-mono text-[11px] text-white">
						{order + 1}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<section class="flex flex-col gap-2">
		<div class="flex items-baseline justify-between">
			<span class="panel-label">重ねたエフェクト</span>
			<span class="font-mono text-[12px] text-muted">{recipe.effects.length}/8</span>
		</div>
		{#if recipe.effects.length === 0}
			<p class="rounded-lg border border-dashed border-line px-3 py-3 text-[13px] text-muted">
				なしのときは静止画（PNG）、ひとつ以上でアニメーション（GIF）になります
			</p>
		{:else}
			<ol class="flex flex-col gap-1">
				{#each recipe.effects as id, i (id)}
					{@const e = effectById(id)}
					<li class="flex h-9 items-center gap-2 rounded-lg bg-raised pr-1 pl-3">
						<span class="w-4 font-mono text-[12px] text-muted">{i + 1}</span>
						<span class="flex-1 text-[13px]">{e?.label ?? id}</span>
						<button type="button" class="btn btn-ghost btn-sm px-2" aria-label="上へ" disabled={i === 0} onclick={() => move(i, -1)}>
							<ArrowUp size={16} strokeWidth={1.5} />
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm px-2"
							aria-label="下へ"
							disabled={i === recipe.effects.length - 1}
							onclick={() => move(i, 1)}
						>
							<ArrowDown size={16} strokeWidth={1.5} />
						</button>
						<button type="button" class="btn btn-ghost btn-sm px-2" aria-label="外す" onclick={() => toggle(id)}>
							<X size={16} strokeWidth={1.5} />
						</button>
					</li>
				{/each}
			</ol>
			<label class="mt-2 flex items-center gap-3">
				<span class="w-12 text-[13px] text-fg2">長さ</span>
				<input type="range" min="0.5" max="3" step="0.1" bind:value={recipe.duration} class="flex-1" />
				<span class="w-10 text-right font-mono text-[12px] tabular-nums text-muted">{recipe.duration.toFixed(1)}s</span>
			</label>
		{/if}
	</section>
</div>
