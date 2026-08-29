/**
 * onto-household — one shopping list, two people.
 *
 * The reference ontoplano plugin: an external program with scoped tokens and
 * no code running inside anybody's server. It keeps two accounts' shopping
 * lists equal — add "milk" on one and it appears on the other; tick it bought
 * in the aisle and it is bought on both.
 *
 * The two accounts can live on different instances — a hosted one and a
 * self-hosted one pair fine, which no shared-table design could offer.
 *
 * Setup:
 *   1. Each person creates an API token (Settings → Integrations) with:
 *      "See everything on your shopping list", "Add to your shopping list,
 *      and tick things bought", and "Ask to be told when things happen"
 *      (shopping:read, shopping:write, webhooks:manage).
 *   2. Run this somewhere both instances can reach:
 *
 *        A_URL=https://ontoplano.com          A_TOKEN=onto_… \
 *        B_URL=https://planner.example.org    B_TOKEN=onto_… \
 *        PUBLIC_URL=https://household.example.org \
 *        node onto-household.mjs
 *
 *   It subscribes its own webhooks on both accounts (idempotently), does one
 *   full sync at startup, and then just listens. PORT defaults to 8787.
 *
 * Loops die on the server's side: events fire only on transitions, so the
 * echo of a mirrored change is a no-op and the pair settles.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);

function side(name) {
	const url = process.env[`${name}_URL`];
	const token = process.env[`${name}_TOKEN`];
	if (!url || !token) {
		console.error(`Set ${name}_URL and ${name}_TOKEN`);
		process.exit(1);
	}
	return { name, url: url.replace(/\/$/, ''), token, secret: null };
}

const A = side('A');
const B = side('B');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
if (!PUBLIC_URL) {
	console.error('Set PUBLIC_URL to where this process is reachable');
	process.exit(1);
}

const other = (s) => (s === A ? B : A);

async function api(s, path, options = {}) {
	const response = await fetch(`${s.url}/api/v1${path}`, {
		...options,
		headers: {
			authorization: `Bearer ${s.token}`,
			'content-type': 'application/json',
			...options.headers
		}
	});
	if (!response.ok && response.status !== 200 && response.status !== 201) {
		throw new Error(`${s.name} ${path}: ${response.status} ${await response.text()}`);
	}
	return response.status === 204 ? null : response.json();
}

/** Make sure each account tells this process about its shopping events. */
async function ensureSubscription(s) {
	const hookUrl = `${PUBLIC_URL}/${s.name.toLowerCase()}`;
	const { webhooks } = await api(s, '/webhooks');
	const mine = webhooks.find((w) => w.url === hookUrl);
	if (mine && !mine.disabled) {
		s.secret = mine.secret;
		return;
	}
	if (mine) await api(s, `/webhooks/${mine.id}`, { method: 'DELETE' });
	const created = await api(s, '/webhooks', {
		method: 'POST',
		body: JSON.stringify({ url: hookUrl, events: ['shopping.added', 'shopping.bought'] })
	});
	s.secret = created.secret;
	console.log(`${s.name}: subscribed ${hookUrl}`);
}

const norm = (name) => name.trim().toLowerCase();

async function addTo(s, name) {
	await api(s, '/shopping/items', { method: 'POST', body: JSON.stringify({ name }) });
}

async function markBought(s, name) {
	const { items } = await api(s, '/shopping');
	const item = items.find((i) => norm(i.name) === norm(name) && !i.bought);
	if (item) {
		await api(s, `/shopping/items/${item.id}/bought`, {
			method: 'POST',
			body: JSON.stringify({ bought: true })
		});
	}
}

/** Anything waiting on one list and absent (or bought) on the other, both ways. */
async function fullSync() {
	const [a, b] = await Promise.all([api(A, '/shopping'), api(B, '/shopping')]);
	const waiting = (list) => new Set(list.items.filter((i) => !i.bought).map((i) => norm(i.name)));
	const aWaiting = waiting(a);
	const bWaiting = waiting(b);
	for (const name of aWaiting) if (!bWaiting.has(name)) await addTo(B, name);
	for (const name of bWaiting) if (!aWaiting.has(name)) await addTo(A, name);
	console.log(`synced: ${aWaiting.size} waiting on ${A.name}, ${bWaiting.size} on ${B.name}`);
}

function verified(s, rawBody, signature) {
	if (!s.secret || !signature) return false;
	const expected = 'sha256=' + createHmac('sha256', s.secret).update(rawBody).digest('hex');
	const given = String(signature);
	return (
		expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given))
	);
}

async function handle(from, event, data) {
	const to = other(from);
	if (event === 'shopping.added') await addTo(to, data.name);
	if (event === 'shopping.bought') await markBought(to, data.name);
	console.log(`${from.name} → ${to.name}: ${event} ${data.name ?? ''}`);
}

await ensureSubscription(A);
await ensureSubscription(B);
await fullSync();

createServer((request, response) => {
	const from = request.url === '/a' ? A : request.url === '/b' ? B : null;
	if (!from || request.method !== 'POST') {
		response.writeHead(404).end();
		return;
	}

	let body = '';
	request.on('data', (chunk) => (body += chunk));
	request.on('end', () => {
		if (!verified(from, body, request.headers['x-ontoplano-signature'])) {
			response.writeHead(401).end();
			return;
		}
		// Answer before working: the sender wants a fast 2xx, not our results.
		response.writeHead(204).end();
		try {
			const { event, data } = JSON.parse(body);
			handle(from, event, data).catch((e) => console.error('sync failed:', e.message));
		} catch {
			// Not JSON, nothing to do.
		}
	});
}).listen(PORT, () => console.log(`listening on :${PORT} for ${PUBLIC_URL}/{a,b}`));
