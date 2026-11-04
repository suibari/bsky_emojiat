import type { BrowserOAuthClient } from '@atproto/oauth-client-browser';

export const OAUTH_SCOPE = [
	'atproto',
	'repo:blue.moji.collection.item',
	'repo:com.suibari.emojiat.recipe',
	'blob:image/*'
].join(' ');

export const isLoopback = (origin: string) =>
	/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

/**
 * 本番は /oauth/client-metadata.json を client_id にする。開発中（localhost）は
 * AT Protocol のループバッククライアントとして、redirect_uri と scope をクエリで渡す。
 */
export function buildClientId(origin: string, port: string) {
	if (!isLoopback(origin)) return `${origin}/oauth/client-metadata.json`;
	const params = new URLSearchParams({
		redirect_uri: `http://127.0.0.1${port ? ':' + port : ''}/oauth/callback`,
		scope: OAUTH_SCOPE
	});
	return `http://localhost?${params}`;
}

export function clientMetadata(origin: string) {
	return {
		client_id: `${origin}/oauth/client-metadata.json`,
		client_name: 'えもじあっと',
		client_uri: origin,
		redirect_uris: [`${origin}/oauth/callback`],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		scope: OAUTH_SCOPE,
		token_endpoint_auth_method: 'none',
		application_type: 'web',
		dpop_bound_access_tokens: true
	};
}

let clientPromise: Promise<BrowserOAuthClient> | undefined;

export function getOAuthClient() {
	clientPromise ??= (async () => {
		const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser');
		return BrowserOAuthClient.load({
			clientId: buildClientId(location.origin, location.port),
			handleResolver: 'https://bsky.social'
		});
	})();
	return clientPromise;
}
