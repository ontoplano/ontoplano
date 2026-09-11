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
import type { ActionReply, EndpointReply, LoadReply } from './routes.js';

const DATA_SUFFIX = '/__data.json';

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
				});
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

		return network(request);
	};
}
