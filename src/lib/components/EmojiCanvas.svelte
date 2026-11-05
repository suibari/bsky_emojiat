<script lang="ts">
	import { createWorkspace, prepare, renderBase, renderFrame, resolveEffects, type BaseLayers, type Workspace } from '$lib/render/draw';
	import type { Recipe } from '$lib/render/recipe';
	import { fontsVersion } from '$lib/fontsVersion.svelte';

	let {
		recipe,
		height,
		playing = true,
		still = 0.6,
		class: className = ''
	}: { recipe: Recipe; height: number; playing?: boolean; still?: number; class?: string } = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let base: BaseLayers | null = $state.raw(null);
	let ws: Workspace | null = null;
	const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

	$effect(() => {
		const r = $state.snapshot(recipe) as Recipe;
		void fontsVersion.value;
		const scale = (height * dpr) / 128;
		let cancelled = false;
		prepare(r).then(() => {
			if (cancelled) return;
			const next = renderBase(r, scale);
			ws = createWorkspace(next.w, next.h);
			base = next;
		}).catch(() => {
			// 壊れた画像などは描かずにおく（書き出し時にエラーとして出る）
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!canvas || !base || !ws) return;
		const b = base;
		const w = ws;
		const r = $state.snapshot(recipe) as Recipe;
		canvas.width = b.w;
		canvas.height = b.h;
		const ctx = canvas.getContext('2d')!;
		const effects = resolveEffects(r.effects);
		if (!playing || effects.length === 0) {
			renderFrame(ctx, b, r, effects, effects.length ? still : 0, w);
			return;
		}
		let raf = 0;
		const loop = (now: number) => {
			renderFrame(ctx, b, r, effects, (now / 1000 / r.duration) % 1, w);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<canvas
	bind:this={canvas}
	class={className}
	style="height:{height}px;width:{height * recipe.aspect}px"
	aria-hidden="true"
></canvas>
