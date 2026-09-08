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
const KEEP_FRESH = ['/inventory', '/health/recipes'];

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

	// Anything cross-origin goes straight to the network, untouched.
	if (url.origin !== location.origin) return;

	/*
	 * A write invalidates the pages we are allowed to answer from memory.
	 *
	 * `KEEP_FRESH` is served cache-first on purpose — a shopping list is read in
	 * a basement, and an hour-old copy beats none. But *within a session* that
	 * is wrong: tick something off, go back to the list, and the cached page
	 * says it is still there. The page then quietly refreshes behind, so the
	 * item reappears as done a moment later, which is worse than either answer.
	 *
	 * So the cached pages last exactly until the next thing that changes
	 * something. Untouched otherwise: a mutation still goes straight to the
	 * network, and nothing is ever replayed.
	 */
	if (request.method !== 'GET') {
		event.waitUntil(caches.delete(PAGE_CACHE));
		return;
	}

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

/**
 * A reminder arriving while the app is closed.
 *
 * This is the whole reason the worker matters on a phone: the push service
 * wakes it with the tab shut, the browser in the background, or the phone
 * locked, and it has a few seconds to put something on the screen. Android
 * refuses `new Notification()` outside here, which is why the in-page path
 * never worked there.
 *
 * `userVisibleOnly` was promised at subscribe time, and browsers enforce it: a
 * push that shows nothing spends the promise, and enough of them get the site's
 * permission revoked. So there is always a notification, including for a
 * payload that fails to parse — silence would be the one outcome that costs us
 * the permission.
 */
sw.addEventListener('push', (event) => {
	const fallback = {
		title: 'Ontoplano',
		body: 'Something is due',
		url: '/',
		tag: undefined,
		audible: false
	};
	let payload: {
		title: string;
		body?: string;
		url?: string;
		tag?: string;
		audible?: boolean;
	} = fallback;
	try {
		if (event.data) payload = { ...fallback, ...(event.data.json() as object) };
	} catch {
		// A payload we cannot read still has to become a notification.
	}

	event.waitUntil(
		sw.registration.showNotification(payload.title, {
			body: payload.body,
			// The same reminder pushed twice replaces itself rather than stacking.
			tag: payload.tag,
			/*
			 * A tagged notification replaces the previous one **silently** unless
			 * this says otherwise — that is what the specification asks for, and
			 * it is why a reminder could arrive with no sound at all while the
			 * phone was working perfectly. Every reminder here is its own tag, so
			 * there is nothing being usefully collapsed; renotify only restores
			 * the behaviour of a notification that has not been seen before.
			 */
			renotify: Boolean(payload.tag),
			/*
			 * And whether it makes a noise at all, which is what was asked for in
			 * Reminders. What it cannot be is somebody's own ringtone: nothing may
			 * play arbitrary audio from a service worker, so an uploaded sound is
			 * for a page that is open. This is the device's own notification
			 * sound, or nothing.
			 */
			silent: !payload.audible,
			vibrate: payload.audible ? [120, 60, 120] : undefined,
			icon: '/icons/icon-192.png',
			// Where tapping it goes, read back in the click handler below.
			data: { url: payload.url ?? '/' }
		} as NotificationOptions)
	);
});

/**
 * Tapping it.
 *
 * A notification you cannot follow is one you have to remember twice, so this
 * always lands somewhere specific — the day the block is on, the person whose
 * birthday it is. An already-open window is reused and navigated rather than
 * joined by a second one: two copies of the app is not what anybody wanted from
 * tapping a reminder.
 */
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
			for (const client of windows) {
				if (new URL(client.url).origin !== location.origin) continue;
				await client.focus();
				if ('navigate' in client) await client.navigate(target).catch(() => {});
				return;
			}
			await sw.clients.openWindow(target);
		})
	);
});

/**
 * The push service telling us a subscription has been replaced.
 *
 * Browsers rotate an endpoint occasionally, and one that is not re-registered
 * simply stops working — quietly, which is the worst way for a reminder to
 * fail. There is no session in here, so this re-subscribes with the same
 * application key and hands the new address to the endpoint that does have one.
 */
sw.addEventListener('pushsubscriptionchange', (event) => {
	const change = event as ExtendableEvent & {
		oldSubscription?: PushSubscription | null;
		newSubscription?: PushSubscription | null;
	};

	change.waitUntil(
		(async () => {
			const key = change.oldSubscription?.options?.applicationServerKey;
			const fresh =
				change.newSubscription ??
				(key
					? await sw.registration.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey: key
						})
					: null);
			if (!fresh) return;

			await fetch('/api/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ subscription: fresh.toJSON() })
			}).catch(() => {});
		})()
	);
});
