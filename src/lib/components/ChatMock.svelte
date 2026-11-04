<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import type { Recipe } from '$lib/render/recipe';
	import EmojiCanvas from './EmojiCanvas.svelte';

	let { recipe, name }: { recipe: Recipe; name: string } = $props();
</script>

<!-- Nagi のタイムラインで使ったときの見え方 -->
<article class="flex gap-3 rounded-xl border border-line bg-card p-4">
	<div class="size-9 shrink-0 rounded-full bg-raised"></div>
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<div class="flex items-baseline gap-2 text-[13px]">
			<span class="font-medium text-fg">{t('mock.you')}</span>
			<span class="truncate text-muted">@you.bsky.social · {t('mock.time')}</span>
		</div>
		<p class="text-[15px] leading-6 text-fg">
			{t('mock.body')}
			<EmojiCanvas {recipe} height={22} class="inline-block -mt-1 ml-1 align-middle" />
		</p>
		<div class="mt-1 flex items-center gap-2">
			<span class="inline-flex h-7 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2">
				<EmojiCanvas {recipe} height={18} />
				<span class="font-mono text-[12px] text-fg">3</span>
			</span>
			<span class="font-mono text-[12px] text-muted">:{name}:</span>
		</div>
	</div>
</article>
