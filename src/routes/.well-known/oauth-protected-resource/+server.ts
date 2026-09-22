import type { RequestHandler } from './$types';

import { protectedResourceMetadata } from '$lib/server/services/oauth';
import { publicJson, publicPreflight } from '$lib/server/oauth-http';

export const GET: RequestHandler = ({ url }) => publicJson(protectedResourceMetadata(url.origin));

export const OPTIONS: RequestHandler = () => publicPreflight('GET, OPTIONS');
