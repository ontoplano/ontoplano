import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { IMPORT_KINDS } from '$lib/imports-catalogue';

/**
 * What this instance can bring things in from, for whoever is listing it.
 *
 * ontoplano.com's FAQ answers "can I bring my tasks over" by name, and it is a
 * different repository with no database, built on a laptop — so the list was
 * typed there by hand and went stale the day Google Keep landed. This is the
 * same arrangement `/api/pricing` has for the one number that must not be typed
 * twice: the app is the source, this is how anything outside reads it, and
 * `make deploy-site` fetches it at build time.
 *
 * Public and cacheable, and it discloses nothing: it is a list of other
 * people's products, identical on every instance of this version.
 */
export const GET: RequestHandler = async () =>
	json({ imports: IMPORT_KINDS }, { headers: { 'cache-control': 'public, max-age=3600' } });
