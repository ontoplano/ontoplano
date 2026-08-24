/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline behaviour.
 *
 * The strategy is deliberately conservative, because this app is a record of
 * what you did and a stale answer is worse than an honest failure. Concretely:
 *
 * - **Build assets** are cache-first. They are content-hashed, so a cached one
 *   is never the wrong one.
 * - **Pages and data** are network-first. A planner that shows yesterday's tasks
 *   because it quietly preferred a cache would be actively misleading.
 * - **Mutations are never cached or replayed.** A queued POST that fires on
 *   reconnect could complete a task twice or delete something the user has since
 *   restored. Offline writes need real conflict handling, which is a feature, not
 *   a cache policy.
 *
 * So this makes the app launch offline and survive a flaky connection while
 * reading. It does not pretend to be an offline-first app.
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSET_CACHE = `assets-${version}`;
const PAGE_CACHE = `pages-${version}`;
const OFFLINE_URL = '/offline';

/** Hashed build output plus static files — safe to keep until the version changes. */
const PRECACHE = [...build, ...files, OFFLINE_URL];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(ASSET_CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			// A precache miss must not wedge the install: one missing file would
			// otherwise leave the app with no service worker at all.
			.catch((e) => console.warn('[sw] precache incomplete:', e))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((k) => k !== ASSET_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))
				)
			)
			.then(() => sw.clients.claim())
	);
});

function isAsset(url: URL): boolean {
	return build.includes(url.pathname) || files.includes(url.pathname);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Anything that changes state, and anything cross-origin, goes straight to
	// the network untouched.
	if (request.method !== 'GET' || url.origin !== location.origin) return;

	// Auth and the API are never served from cache: a cached session check or a
	// cached token list is a security answer that has gone stale.
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/settings/account/export'))
		return;

	if (isAsset(url)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Everything else: try the network, fall back to what we last saw, and only
	// then to the offline page.
	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response.ok && response.type === 'basic') {
					const copy = response.clone();
					caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
				}
				return response;
			})
			.catch(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;

				// Only navigations get the offline page; a failed data request
				// should look like a failure, not like an HTML document.
				if (request.mode === 'navigate') {
					const offline = await caches.match(OFFLINE_URL);
					if (offline) return offline;
				}

				return new Response('Offline', { status: 503, statusText: 'Offline' });
			})
	);
});
