import type { RequestHandler } from './$types';

import { authorizationServerMetadata } from '$lib/server/services/oauth';
import { publicJson, publicPreflight } from '$lib/server/oauth-http';

export const GET: RequestHandler = ({ url }) => publicJson(authorizationServerMetadata(url.origin));

export const OPTIONS: RequestHandler = () => publicPreflight('GET, OPTIONS');
