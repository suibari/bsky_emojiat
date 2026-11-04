import { json } from '@sveltejs/kit';
import { clientMetadata } from '$lib/atproto/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
	json(clientMetadata(url.origin), { headers: { 'cache-control': 'public, max-age=600' } });
