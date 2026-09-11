/**
 * The self-contained instance's answer to the app's own requests.
 *
 * SvelteKit's client asks a server for two things: `__data.json` when it
 * loads a page, and a `?/action` POST when a form submits. In self-contained mode this
 * bridge sits on `fetch` and answers both from the worker, in the exact wire
 * format the server would use — so the app above it does not know there is no
 * server, and no route, form, or component changes to run on the device. A request
 * for anything else, or for a route with no self-contained twin, goes to the network
 * as if this file did not exist.
 */
import * as devalue from 'devalue';
import { ask } from './client.js';
import { isSelfContainedBuild } from './mode.js';
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

export function installSelfContainedBridge(): void {
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
			} else if (url.pathname.startsWith('/api/')) {
				const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.clone().text();
				const reply = await ask<EndpointReply | null>('route.endpoint', {
					method: request.method,
					pathname: url.pathname,
					search: url.search,
					body,
					contentType: request.headers.get('content-type')
				});
				if (reply)
					return new Response(reply.text, {
						status: reply.status,
						headers: reply.contentType ? { 'content-type': reply.contentType } : undefined
					});
			} else if (request.method === 'POST') {
				const action = [...url.searchParams.keys()].find((k) => k.startsWith('/'))?.slice(1);
				if (action) {
					const form = [...(await request.clone().formData()).entries()].filter(
						(entry): entry is [string, string] => typeof entry[1] === 'string'
					);
					const reply = await ask<ActionReply | null>('route.action', {
						pathname: url.pathname,
						search: url.search,
						action,
						form
					});
					if (reply) return actionResponse(reply);
				}
			}
		}

		/*
		 * Nothing on the device could answer it.
		 *
		 * Behind the `?selfContained` switch a server is still there, so the
		 * request goes to it. In the built app there is none: the asset host
		 * answers an unknown path with nothing, the client parses that empty
		 * body as JSON and the screen reads "500" — which is what Estevão saw
		 * on /settings/account. A screen that needs a server says so instead.
		 */
		if (isSelfContainedBuild() && url.origin === location.origin && !isAsset(url.pathname)) {
			return dataResponse({
				kind: 'error',
				status: 501,
				message:
					'This screen needs an instance with a server. On this device ontoplano runs ' +
					'on its own, so the parts that need something reachable — the account, ' +
					'pictures, mail — are not here.'
			});
		}

		return network(request);
	};
}
