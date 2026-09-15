/**
 * The isolated instance's answer to the app's own requests.
 *
 * SvelteKit's client asks a server for two things: `__data.json` when it
 * loads a page, and a `?/action` POST when a form submits. In isolated mode this
 * bridge sits on `fetch` and answers both from the worker, in the exact wire
 * format the server would use — so the app above it does not know there is no
 * server, and no route, form, or component changes to run on the device. A request
 * for anything else, or for a route with no isolated twin, goes to the network
 * as if this file did not exist.
 */
import * as devalue from 'devalue';
import { ask } from './client.js';
import { isIsolatedBuild } from './mode.js';
import type { ActionReply, EndpointReply, LoadReply } from './routes.js';

const DATA_SUFFIX = '/__data.json';

/** The app's own files, which the shell serves and the bridge never touches. */
function isAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/icons/') ||
		pathname.startsWith('/sounds/') ||
		pathname.startsWith('/help/') ||
		/\.[a-z0-9]+$/i.test(pathname)
	);
}

/** The statuses whose whole meaning is that there is no body. */
const EMPTY_STATUSES = new Set([204, 205, 304]);

function json(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' }
	});
}

function dataResponse(reply: LoadReply): Response {
	if (reply.kind === 'redirect')
		return json(JSON.stringify({ type: 'redirect', location: reply.location }));
	if (reply.kind === 'error') return json(JSON.stringify({ message: reply.message }), reply.status);
	const nodes = reply.nodes.map((node) =>
		node === null
			? 'null'
			: // `"url":1` on every node: a local read is too cheap to cache, and a
				// node that always re-runs is one that is never stale.
				`{"type":"data","data":${devalue.stringify(node.data)},"uses":{"url":1}}`
	);
	return json(`{"type":"data","nodes":[${nodes.join(',')}]}`);
}

function actionResponse(reply: ActionReply): Response {
	if (reply.kind === 'redirect')
		return json(
			JSON.stringify({ type: 'redirect', status: reply.status, location: reply.location })
		);
	if (reply.kind === 'error')
		return json(JSON.stringify({ type: 'error', error: { message: reply.message } }), reply.status);
	return json(
		JSON.stringify({
			type: reply.kind,
			status: reply.status,
			data: devalue.stringify(reply.data)
		})
	);
}

let installed = false;

export function installIsolatedBridge(): void {
	if (installed) return;
	installed = true;

	const network = window.fetch.bind(window);

	window.fetch = async (input, init) => {
		const request =
			input instanceof Request && init === undefined ? input : new Request(input, init);
		const url = new URL(request.url, location.href);

		if (url.origin === location.origin) {
			if (request.method === 'GET' && url.pathname.endsWith(DATA_SUFFIX)) {
				const pathname = url.pathname.slice(0, -DATA_SUFFIX.length) || '/';
				const search = url.search;
				const reply = await ask<LoadReply | null>('route.load', {
					pathname,
					search,
					cookie: document.cookie
				}).catch(
					(e): LoadReply => ({ kind: 'error', status: 500, message: String(e?.message ?? e) })
				);
				if (reply) return dataResponse(reply);
			} else if (
				request.method === 'POST' &&
				[...url.searchParams.keys()].some((k) => k.startsWith('/'))
			) {
				const action = [...url.searchParams.keys()].find((k) => k.startsWith('/'))!.slice(1);
				{
					/*
					 * Files go over as files.
					 *
					 * A `File` is structured-cloneable, so the bytes of a picture
					 * cross to the worker without being turned into a string
					 * first — which is what lets the gallery's upload be the same
					 * action body on both sides.
					 */
					const form = [...(await request.clone().formData()).entries()];
					const reply = await ask<ActionReply | null>('route.action', {
						pathname: url.pathname,
						search: url.search,
						action,
						form
					});
					if (reply) return actionResponse(reply);
				}
			} else if (!isAsset(url.pathname)) {
				/*
				 * Any endpoint the device carries, not only the ones under `/api`.
				 *
				 * `/media` is the one that made this matter: it is where the note
				 * composer posts a picture, it is not an API route, and asking only
				 * about `/api` meant attaching a picture to a note on the device
				 * answered "this screen needs an instance with a server" — which was
				 * never true of bytes that were going to live on this phone. The
				 * worker says `null` for a path it has no endpoint for, and then
				 * this falls through exactly as before.
				 */
				const contentType = request.headers.get('content-type');
				const posted = !['GET', 'HEAD'].includes(request.method);
				const isForm =
					posted &&
					/multipart\/form-data|application\/x-www-form-urlencoded/.test(contentType ?? '');
				const reply = await ask<EndpointReply | null>('route.endpoint', {
					method: request.method,
					pathname: url.pathname,
					search: url.search,
					body: posted && !isForm ? await request.clone().text() : null,
					contentType,
					form: isForm ? [...(await request.clone().formData()).entries()] : undefined
				});
				if (reply)
					return new Response(
						/*
						 * Nothing at all for the statuses that forbid a body.
						 *
						 * 204, 205 and 304 are "there is no content" — the Response
						 * constructor throws outright if given one, even the empty
						 * string the worker sends back for a handler that returned
						 * `new Response(null, …)`. It is not theoretical: dismissing
						 * the tour posts to `/api/tutorial`, which answers 204, and
						 * on the device that threw inside `fetch` rather than
						 * recording anything.
						 */
						EMPTY_STATUSES.has(reply.status) ? null : reply.text,
						{
							status: reply.status,
							headers: reply.contentType ? { 'content-type': reply.contentType } : undefined
						}
					);
			}
		}

		/*
		 * Nothing on the device could answer it.
		 *
		 * Behind the `?isolated` switch a server is still there, so the
		 * request goes to it. In the built app there is none: the asset host
		 * answers an unknown path with nothing, the client parses that empty
		 * body as JSON and the screen reads "500" — which is what Estevão saw
		 * on /settings/account. A screen that needs a server says so instead.
		 */
		/*
		 * The route asked for, not the file SvelteKit fetches for it.
		 *
		 * A page's data arrives as `/settings/account/__data.json`, which ends
		 * in an extension — so the asset test said "asset", the sentence below
		 * never fired, and the request went to the file host instead. It
		 * answers an unknown path with an empty 404, which the client renders
		 * as "that page is not here" (or, on the phone's own server, as a 500
		 * from an unparseable body). Every screen without a twin looked broken
		 * rather than absent.
		 */
		const asked = url.pathname.endsWith(DATA_SUFFIX)
			? url.pathname.slice(0, -DATA_SUFFIX.length) || '/'
			: url.pathname;

		if (isIsolatedBuild() && url.origin === location.origin && !isAsset(asked)) {
			return dataResponse({
				kind: 'error',
				status: 501,
				message:
					'This screen needs an instance with a server. On this device ontoplano runs ' +
					'on its own, so the parts that need something reachable — the account, ' +
					'mail, anything with somebody else in it — are not here.'
			});
		}

		return network(request);
	};
}
