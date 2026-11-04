<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { goto } from '$app/navigation';
	import { session } from '$lib/atproto/session.svelte';

	$effect(() => {
		if (!session.ready) return;
		if (session.oauth) void goto(session.returnTo ?? '/', { replaceState: true });
	});
</script>

<div class="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-24 text-center">
	{#if session.ready && !session.oauth}
		<p class="text-[14px] text-fg">{t('auth.callbackFailed')}</p>
		{#if session.error}<p class="font-mono text-[12px] text-muted">{session.error}</p>{/if}
		<a href="/" class="btn btn-secondary btn-sm">{t('auth.back')}</a>
	{:else}
		<p class="text-[14px] text-fg2">{t('auth.callbackLoading')}</p>
	{/if}
</div>
