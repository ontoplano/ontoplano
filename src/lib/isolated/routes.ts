/**
 * The isolated instance's routing table.
 *
 * A route has one file, `+page.server.ts`, and this runs the same one the
 * server would. There is nothing to write twice and nothing to keep in step:
 * the list below says which routes come to the device, and everything else
 * about a route is wherever it already was. It runs inside the database worker,
 * because the services it calls are synchronous over the database that lives
 * there.
 */
import { isActionFailure, isRedirect, isHttpError } from '@sveltejs/kit';
import { ISOLATED_USER_ID } from './config.js';

/**
 * The slice of SvelteKit's request event the isolated routes are written
 * against. Small on purpose: everything in it exists in a worker, so a route
 * that stays inside it runs identically on the server and on the device.
 */
export interface IsolatedEvent {
	request: Request;
	url: URL;
	/** Every segment the route pattern names is present once it matched. */
	params: Record<string, string>;
	/**
	 * Optional to stay assignable from the server's own event, where a
	 * session may be absent. On an isolated instance it is always the one account, so route
	 * bodies keep the same `locals.user!.id` they were born with.
	 */
	locals: { user?: { id: string } | undefined };
	/**
	 * The page's own cookies, forwarded by the bridge. Only what client code
	 * can read — which is all an isolated instance has, and all the view
	 * preferences that ride on cookies ever were.
	 */
	cookies: { get(name: string): string | undefined };
}

type PageModule = {
	load?: (event: IsolatedEvent) => unknown;
	actions?: Record<string, (event: IsolatedEvent) => unknown>;
};
type LayoutModule = { load?: (event: IsolatedEvent) => unknown };

/*
 * Every route's own server file, and the handful that cannot come.
 *
 * There is one file per route and it is the one SvelteKit already loads.
 * There used to be two — the body in a file of its own and a
 * `+page.server.ts` beside it re-exporting it — which is a pattern somebody
 * has to know about before they can add a screen, and one more thing to be
 * wrong.
 *
 * Portable is therefore the default, and the exceptions are named below: a
 * route whose server file reaches for `$lib/server` or for Node cannot be
 * compiled into a worker, so it is excluded here. Forget one and the isolated
 * build fails immediately, naming the import it cannot follow — which is the
 * right moment to find out, and the reason this list can be trusted.
 */
const pages = import.meta.glob(
	[
		'/src/routes/**/+page.server.ts',
		'!/src/routes/admin/**',
		'!/src/routes/api/**',
		'!/src/routes/buy/**',
		'!/src/routes/demo/**',
		'!/src/routes/dev/**',
		'!/src/routes/health/recipes/**',
		'!/src/routes/legal/**',
		'!/src/routes/login/**',
		'!/src/routes/mail/**',
		'!/src/routes/newsletter/**',
		'!/src/routes/notebooks/people/**',
		'!/src/routes/settings/**',
		'!/src/routes/start/**',
		'!/src/routes/welcome/**'
	],
	{ eager: true }
) as Record<string, PageModule>;

/*
 * The ones that stayed behind, by name only.
 *
 * `?url` so their code is never pulled into this bundle — only the fact that
 * they exist. A route named here is a screen about a deployment, and the
 * bridge answers it with the sentence about needing a server rather than
 * drawing it empty.
 */
const notHere = import.meta.glob(
	[
		'/src/routes/admin/**/+page.server.ts',
		'/src/routes/buy/+page.server.ts',
		'/src/routes/demo/**/+page.server.ts',
		'/src/routes/dev/**/+page.server.ts',
		'/src/routes/health/recipes/**/+page.server.ts',
		'/src/routes/legal/**/+page.server.ts',
		'/src/routes/login/**/+page.server.ts',
		'/src/routes/mail/**/+page.server.ts',
		'/src/routes/newsletter/**/+page.server.ts',
		'/src/routes/notebooks/people/+page.server.ts',
		'/src/routes/settings/**/+page.server.ts',
		'/src/routes/start/+page.server.ts',
		'/src/routes/welcome/**/+page.server.ts'
	],
	{ query: '?url', eager: true }
) as Record<string, unknown>;

/*
 * Every screen in the app, whether or not it has a server file.
 *
 * `/instance` is the shape that made this necessary: choosing where your
 * ontoplano lives needs nothing loaded, so it has no `+page.server.ts` at all
 * — and a table built only from server files did not know the route existed,
 * so the one way off a phone-only instance answered "this needs a server".
 * `?url` keeps the Svelte compiler out of the worker: only the keys matter.
 */
const screens = import.meta.glob('/src/routes/**/+page.svelte', {
	query: '?url',
	eager: true
}) as Record<string, unknown>;
type EndpointModule = Partial<
	Record<
		'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
		(event: IsolatedEvent) => Response | Promise<Response>
	>
>;
const endpoints = import.meta.glob(
	[
		'/src/routes/api/capture-options/+server.ts',
		'/src/routes/api/reminders/+server.ts',
		'/src/routes/api/search/+server.ts',
		'/src/routes/api/tutorial/+server.ts'
	],
	{ eager: true }
) as Record<string, EndpointModule>;
/*
 * A layout is the one place the two instances genuinely differ.
 *
 * A page asks the same question either way — what is on this screen — and so
 * one file answers it. The shell does not: `+layout.server.ts` is about a
 * deployment (sessions, the demo band, push keys, who may administer), and a
 * device has none of those. So where the answers differ there is a
 * `layout.isolated.ts` saying what is true here, and where they do not the
 * route's own file comes as it is.
 */
const layouts = import.meta.glob(
	['/src/routes/**/layout.isolated.ts', '/src/routes/health/+layout.server.ts'],
	{ eager: true }
) as Record<string, LayoutModule>;
// Keys only, never compiled: the node array a data request answers with has
// one slot per +layout.svelte on the branch, so their positions are needed
// even though their components never run here. `?url` keeps the Svelte
// compiler out of the worker build — the values are ignored.
const layoutShells = import.meta.glob('/src/routes/**/+layout.svelte', {
	query: '?url',
	import: 'default',
	eager: true
});

const PREFIX = '/src/routes';

/** '/src/routes/tasks/todo/+page.server.ts' -> '/tasks/todo'; root -> '/'. */
function dirOf(key: string, suffix: string): string {
	return key.slice(PREFIX.length, -suffix.length) || '/';
}

type Matcher = { dir: string; pattern: RegExp; names: string[]; module: PageModule };

/** `/src/routes/x/+page.svelte` -> `/src/routes/x/+page.server.ts`. */
const serverFileFor = (screen: string) => screen.replace(/\+page\.svelte$/, '+page.server.ts');

const matchers: Matcher[] = Object.keys(screens)
	.filter((key) => !(serverFileFor(key) in notHere))
	.map((key) => {
		const dir = dirOf(key, '/+page.svelte');
		// The route's own server file when it came, and nothing when the screen
		// needs nothing loaded.
		const module: PageModule = pages[serverFileFor(key)] ?? {};
		const names: string[] = [];
		const pattern = new RegExp(
			'^' +
				dir
					.split('/')
					.map((segment) => {
						const dynamic = segment.match(/^\[(.+)]$/);
						if (!dynamic) return segment.replace(/[.*+?^${}()|\\]/g, '\\$&');
						names.push(dynamic[1]);
						return '([^/]+)';
					})
					.join('/') +
				'$'
		);
		return { dir, pattern, names, module };
	})
	// Static segments outrank dynamic ones, the way SvelteKit ranks routes.
	.sort((a, b) => Number(a.dir.includes('[')) - Number(b.dir.includes('[')));

export function matchIsolatedRoute(
	pathname: string
): { matcher: Matcher; params: Record<string, string> } | null {
	const clean = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	for (const matcher of matchers) {
		const hit = clean.match(matcher.pattern);
		if (hit) {
			const params: Record<string, string> = {};
			matcher.names.forEach((name, i) => (params[name] = decodeURIComponent(hit[i + 1])));
			return { matcher, params };
		}
	}
	return null;
}

function eventFor(
	url: URL,
	params: Record<string, string>,
	request?: Request,
	cookieHeader = ''
): IsolatedEvent {
	const jar = new Map(
		cookieHeader
			.split(';')
			.map((pair) => pair.trim().split('=') as [string, string])
			.filter(([name]) => name)
			.map(([name, value]) => [name, decodeURIComponent(value ?? '')])
	);
	return {
		request: request ?? new Request(url),
		url,
		params,
		locals: { user: { id: ISOLATED_USER_ID } },
		cookies: { get: (name) => jar.get(name) }
	};
}

/** The branch of layout slots for a route dir, leaf excluded. */
function branchOf(dir: string): { shell: boolean; module: LayoutModule | null }[] {
	const prefixes = ['/'];
	if (dir !== '/') {
		const parts = dir.split('/').slice(1);
		for (let i = 1; i <= parts.length; i++) prefixes.push('/' + parts.slice(0, i).join('/'));
	}
	return prefixes
		.map((prefix) => {
			const at = prefix === '/' ? '' : prefix;
			return {
				shell: `${PREFIX}${at}/+layout.svelte` in layoutShells,
				module:
					layouts[`${PREFIX}${at}/layout.isolated.ts`] ??
					layouts[`${PREFIX}${at}/+layout.server.ts`] ??
					null
			};
		})
		.filter((slot) => slot.shell || slot.module);
}

export type LoadReply =
	| { kind: 'data'; nodes: ({ data: unknown } | null)[] }
	| { kind: 'redirect'; location: string }
	| { kind: 'error'; status: number; message: string };

export async function runIsolatedLoad(
	pathname: string,
	search: string,
	cookieHeader = ''
): Promise<LoadReply | null> {
	const hit = matchIsolatedRoute(pathname);
	if (!hit) return null;
	const url = new URL(pathname + search, self.location.origin);
	const event = eventFor(url, hit.params, undefined, cookieHeader);
	try {
		const nodes: ({ data: unknown } | null)[] = [];
		for (const slot of branchOf(hit.matcher.dir)) {
			nodes.push(slot.module?.load ? { data: await slot.module.load(event) } : null);
		}
		nodes.push(hit.matcher.module.load ? { data: await hit.matcher.module.load(event) } : null);
		return { kind: 'data', nodes };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status, message: e.body.message };
		throw e;
	}
}

export type EndpointReply = { status: number; contentType: string | null; text: string };

/**
 * An app-internal API call — /api/reminders, /api/search — answered on the device.
 * The twin returns a real Response; only its readable parts cross the worker
 * boundary, because a Response does not survive postMessage.
 */
export async function runIsolatedEndpoint(
	method: string,
	pathname: string,
	search: string,
	body: string | null,
	contentType: string | null
): Promise<EndpointReply | null> {
	const clean = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	const module = endpoints[`${PREFIX}${clean}/+server.ts`];
	const handler = module?.[method as 'GET'];
	if (!handler) return null;

	const url = new URL(pathname + search, self.location.origin);
	const request = new Request(url, {
		method,
		body: body ?? undefined,
		headers: contentType ? { 'content-type': contentType } : undefined
	});
	const response = await handler(eventFor(url, {}, request));
	return {
		status: response.status,
		contentType: response.headers.get('content-type'),
		text: await response.text()
	};
}

export type ActionReply =
	| { kind: 'success'; status: number; data: unknown }
	| { kind: 'failure'; status: number; data: unknown }
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'error'; status: number; message: string };

export async function runIsolatedAction(
	pathname: string,
	search: string,
	action: string,
	form: [string, FormDataEntryValue][]
): Promise<ActionReply | null> {
	const hit = matchIsolatedRoute(pathname);
	if (!hit) return null;
	const handler = hit.matcher.module.actions?.[action];
	if (!handler) return { kind: 'error', status: 405, message: `No such action: ${action}` };

	const body = new FormData();
	for (const [name, value] of form) body.append(name, value);
	const url = new URL(pathname + search, self.location.origin);
	const request = new Request(url, { method: 'POST', body });

	try {
		const result = await handler(eventFor(url, hit.params, request));
		if (isActionFailure(result))
			return { kind: 'failure', status: result.status, data: result.data };
		return { kind: 'success', status: result ? 200 : 204, data: result };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', status: e.status, location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status, message: e.body.message };
		throw e;
	}
}
