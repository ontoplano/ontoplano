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
 *
 * One exception, and it is deliberate. The **shopping list** is read in a shop:
 * a basement, a queue, a train. A copy from an hour ago is exactly what is
 * wanted there, and its staleness is visible and harmless in a way a stale plan
 * is not. So the pages in `KEEP_FRESH` are served from cache first and quietly
 * refreshed behind, and they are fetched at install so the first offline visit
 * works even if nobody has opened them since the worker took over.
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSET_CACHE = `assets-${version}`;
const PAGE_CACHE = `pages-${version}`;
const OFFLINE_URL = '/offline';

/**
 * Pages worth having before they are asked for, because they are read where
 * there is no signal. Kept small: each one is a request on every install.
 */
const KEEP_FRESH = ['/shopping', '/kitchen/recipes', '/kitchen/meals'];

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
			.then(() => caches.open(PAGE_CACHE))
			.then((cache) =>
				// Signed out, these are redirects and nothing is stored, which is
				// correct: there is nothing to show offline either.
				Promise.all(
					KEEP_FRESH.map((path) =>
						fetch(path)
							.then((res) => (res.ok && res.type === 'basic' ? cache.put(path, res) : undefined))
							.catch(() => undefined)
					)
				)
			)
			.catch(() => undefined)
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

	// The shopping list and what you are cooking: answer from the cache at once
	// and refresh behind. An hour-old list in a shop beats no list at all, and
	// unlike the plan, nothing about it is misleading when it is a little old.
	if (request.mode === 'navigate' && KEEP_FRESH.includes(url.pathname)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				const fresh = fetch(request)
					.then((response) => {
						if (response.ok && response.type === 'basic') {
							const copy = response.clone();
							caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
						}
						return response;
					})
					.catch(async () => {
						const offline = await caches.match(OFFLINE_URL);
						return offline ?? new Response('Offline', { status: 503 });
					});

				return cached ?? fresh;
			})
		);
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
