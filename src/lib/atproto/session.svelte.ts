import { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-browser';
import { getOAuthClient } from './oauth';

type Profile = { handle: string; displayName?: string; avatar?: string };

class SessionState {
	ready = $state(false);
	oauth = $state<OAuthSession | null>(null);
	profile = $state<Profile | null>(null);
	error = $state<string | null>(null);
	/** ログイン完了後に戻る先（ログイン開始時のパス） */
	returnTo: string | null = null;

	get did() {
		return this.oauth?.did ?? null;
	}
	get agent() {
		return this.oauth ? new Agent(this.oauth) : null;
	}

	async init() {
		if (this.ready) return;
		try {
			const client = await getOAuthClient();
			const result = await client.init();
			if (result?.session) this.oauth = result.session;
			if (result && 'state' in result && typeof result.state === 'string') this.returnTo = result.state;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.ready = true;
		}
		if (this.oauth) void this.loadProfile();
	}

	async loadProfile() {
		if (!this.did) return;
		try {
			const res = await fetch(
				`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(this.did)}`
			);
			if (res.ok) {
				const p = await res.json();
				this.profile = { handle: p.handle, displayName: p.displayName, avatar: p.avatar };
			}
		} catch {
			// プロフィールが取れなくても保存は使える
		}
	}

	async signIn(handle: string) {
		const client = await getOAuthClient();
		const input = handle.trim().replace(/^@/, '') || 'https://bsky.social';
		await client.signIn(input, { state: location.pathname + location.search });
	}

	async signOut() {
		const s = this.oauth;
		this.oauth = null;
		this.profile = null;
		try {
			await s?.signOut();
		} catch {
			// ローカルの状態は消えているので無視
		}
	}
}

export const session = new SessionState();
