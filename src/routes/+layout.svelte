<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ArrowUpRight, LogOut } from 'lucide-svelte';
	import { googleFontsHref } from '$lib/render/fonts';
	import { session } from '$lib/atproto/session.svelte';
	import { NAGI_URL } from '$lib/nagi';

	let { children } = $props();

	let loginOpen = $state(false);
	let menuOpen = $state(false);
	let handle = $state('');
	let signingIn = $state(false);
	let loginError = $state('');

	onMount(() => {
		void session.init();
	});

	async function signIn(e: SubmitEvent) {
		e.preventDefault();
		signingIn = true;
		loginError = '';
		try {
			await session.signIn(handle);
		} catch (err) {
			loginError = err instanceof Error ? err.message : String(err);
			signingIn = false;
		}
	}

	const nav = [
		{ href: '/', label: '作る' },
		{ href: '/library', label: 'マイ絵文字' }
	];
</script>

<svelte:head>
	<title>えもじあっと</title>
	<meta name="description" content="文字を打つだけで、Nagi や AT Protocol で使えるカスタム絵文字を作れます" />
	<link rel="stylesheet" href={googleFontsHref()} />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<header class="sticky top-0 z-30 border-b border-line bg-bg">
		<div class="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 whitespace-nowrap sm:gap-4 md:px-6">
			<a href="/" class="flex items-center gap-2" aria-label="えもじあっと トップ">
				<img src="/favicon.png" alt="" width="28" height="28" class="size-7" />
				<span class="text-[16px] font-medium tracking-normal">えもじあっと</span>
			</a>
			<nav class="flex items-center gap-1 sm:ml-2">
				{#each nav as n (n.href)}
					<a
						href={n.href}
						aria-current={page.url.pathname === n.href ? 'page' : undefined}
						class="flex h-8 items-center rounded-lg px-2 text-[14px] transition-colors duration-150 sm:px-3
							{page.url.pathname === n.href ? 'bg-raised text-fg' : 'text-fg2 hover:text-fg'}">{n.label}</a
					>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-2">
				<a
					href={NAGI_URL}
					target="_blank"
					rel="noopener"
					class="hidden h-8 items-center gap-1 rounded-lg px-3 text-[14px] text-fg2 transition-colors duration-150 hover:text-fg sm:flex"
				>
					Nagiで使う
					<ArrowUpRight size={16} strokeWidth={1.5} />
				</a>
				{#if !session.ready}
					<span class="h-8 w-20"></span>
				{:else if session.oauth}
					<div class="relative">
						<button
							type="button"
							class="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-fg2 hover:bg-raised hover:text-fg"
							onclick={() => (menuOpen = !menuOpen)}
							aria-expanded={menuOpen}
						>
							{#if session.profile?.avatar}
								<img src={session.profile.avatar} alt="" class="size-6 rounded-full" />
							{:else}
								<span class="size-6 rounded-full bg-raised"></span>
							{/if}
							<span class="hidden max-w-40 truncate sm:inline">@{session.profile?.handle ?? session.did}</span>
						</button>
						{#if menuOpen}
							<div class="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-card p-1">
								<p class="truncate px-3 py-2 text-[12px] text-muted">{session.did}</p>
								<button
									type="button"
									class="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[14px] text-fg2 hover:bg-raised hover:text-fg"
									onclick={() => {
										menuOpen = false;
										void session.signOut();
									}}
								>
									<LogOut size={16} strokeWidth={1.5} />
									ログアウト
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<button type="button" class="btn btn-secondary btn-sm" onclick={() => (loginOpen = !loginOpen)}>ログイン</button>
				{/if}
			</div>
		</div>
	</header>

	{#if loginOpen && !session.oauth}
		<div class="fixed inset-0 z-40 bg-black/50" role="presentation" onclick={() => (loginOpen = false)}></div>
		<form
			onsubmit={signIn}
			class="fixed top-16 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-3 rounded-2xl border border-line bg-card p-5"
		>
			<h2 class="text-[16px] font-medium">PDSに保存する</h2>
			<p class="text-[13px] leading-5 text-fg2">
				Bluesky などの AT Protocol アカウントでログインすると、作った絵文字をあなたの PDS に保存でき、Nagi
				でそのまま使えます。ログインしなくても作成・ダウンロード・ブラウザへの保存はできます。
			</p>
			<label class="flex flex-col gap-1">
				<span class="text-[13px] text-fg2">ハンドル</span>
				<input class="field" bind:value={handle} placeholder="you.bsky.social" autocomplete="username" autocapitalize="off" />
			</label>
			{#if loginError}<p class="text-[13px] text-danger">{loginError}</p>{/if}
			<button type="submit" class="btn btn-primary" disabled={signingIn}>
				{signingIn ? '移動しています' : 'ログイン'}
			</button>
		</form>
	{/if}

	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>
</div>
