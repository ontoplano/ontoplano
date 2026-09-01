/**
 * Fetching a page somebody pasted, without becoming a way into the network.
 *
 * This is the dangerous half of importing a recipe, and it is dangerous in a
 * specific, well-known way. A server that fetches a URL a user supplies is a
 * **server-side request forgery** hole: the request comes from inside, so it
 * reaches everything the box can reach and nothing outside can. On a rented VPS
 * that is the cloud provider's metadata service — `169.254.169.254`, which
 * hands out credentials to anyone who asks. On a home server it is the router's
 * admin page, the NAS, the printer, and this app's own port.
 *
 * Ontoplano is meant to be run by other people on their own machines, so the
 * guard is not optional and not a setting. What it does:
 *
 *  - **Only http and https.** `file://` reads the disk. `gopher://` and friends
 *    have been used to speak other protocols through a fetch.
 *  - **Resolves the name and checks the address**, not the string. `localhost`,
 *    `127.0.0.1`, `0x7f.1`, `[::1]`, a name whose A record is `10.0.0.5` — all
 *    of them are the same request, and only the resolved address knows it.
 *  - **Follows redirects by hand**, checking every hop. A public URL that 302s
 *    to `http://169.254.169.254/` is the standard bypass, and `fetch` following
 *    redirects on its own would walk straight into it.
 *  - **Caps the response and the time.** A page is a page; an endless stream is
 *    a way to exhaust memory.
 *
 * There is a residual race — the name could resolve to a public address here
 * and a private one microseconds later (DNS rebinding). Closing it properly
 * means connecting to the checked address with the Host header set, which Node
 * cannot do through `fetch`. It is documented rather than hidden: the payoff
 * for an attacker is one GET whose body is parsed as a recipe and discarded,
 * and the accounts that can reach this are the ones that can already sign in.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { ValidationError } from './errors.js';

/** As long as anybody should wait for somebody else's blog. */
const TIMEOUT_MS = 10_000;
/** A recipe page is well under this. Anything larger is not one. */
const MAX_BYTES = 2 * 1024 * 1024;
/** Enough for a canonical-URL bounce and a country redirect, not a loop. */
const MAX_REDIRECTS = 5;

/**
 * Whether an address belongs to a network that is nobody else's business.
 *
 * Written out rather than reached for from a package: it is a short list, it
 * does not change, and a dependency for it is a dependency in the path of the
 * one function that must not be wrong.
 */
export function isPrivateAddress(address: string): boolean {
	const version = isIP(address);
	if (version === 0) return true; // Not an address at all: refuse rather than guess.

	if (version === 4) {
		const [a, b] = address.split('.').map(Number);
		if (a === 0) return true; // "this network"
		if (a === 10) return true; // private
		if (a === 127) return true; // loopback
		if (a === 169 && b === 254) return true; // link-local, and cloud metadata
		if (a === 172 && b >= 16 && b <= 31) return true; // private
		if (a === 192 && b === 168) return true; // private
		if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
		if (a === 192 && b === 0) return true; // IETF protocol assignments
		if (a >= 224) return true; // multicast, and reserved
		return false;
	}

	const v6 = address.toLowerCase().replace(/^\[|\]$/g, '');
	if (v6 === '::1' || v6 === '::') return true; // loopback, unspecified
	if (v6.startsWith('fe80')) return true; // link-local
	if (/^f[cd]/.test(v6)) return true; // unique local
	if (v6.startsWith('ff')) return true; // multicast
	// An IPv4 address wearing an IPv6 hat is still that address.
	const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
	if (mapped) return isPrivateAddress(mapped[1]);
	return false;
}

/** The URL, if it is one this may fetch. Throws with a reason if not. */
export async function assertFetchable(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new ValidationError('That is not a web address.');
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:')
		throw new ValidationError('Only http and https addresses can be read.');

	// A literal address needs no lookup, and must not get one.
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(host)) {
		if (isPrivateAddress(host)) throw new ValidationError(refusal);
		return url;
	}

	let addresses;
	try {
		addresses = await lookup(host, { all: true });
	} catch {
		throw new ValidationError('That address does not resolve.');
	}

	// Every address it resolves to, not the first: a name with one public and
	// one private record would otherwise be a coin flip.
	if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address)))
		throw new ValidationError(refusal);

	return url;
}

/**
 * Said the same way for every refused address.
 *
 * "That is a private address" and "that is the metadata service" would together
 * map somebody's network one guess at a time.
 */
const refusal = 'That address is not reachable from here.';

/**
 * Somebody else's page, as text.
 *
 * Redirects are followed here rather than by `fetch`, because each hop has to
 * be checked: a public URL that redirects to a private one is the whole attack.
 */
export async function fetchPage(raw: string): Promise<string> {
	let url = await assertFetchable(raw);

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch(url, {
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					// Said plainly. A fetcher that pretends to be a browser is a
					// fetcher whose operator did not want to be identified.
					'user-agent': 'ontoplano-recipe-import (+https://github.com/ontoplano/ontoplano)',
					accept: 'text/html,application/xhtml+xml'
				}
			});
		} catch {
			throw new ValidationError('That page could not be reached.');
		} finally {
			clearTimeout(timer);
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			if (!location) throw new ValidationError('That page redirected to nowhere.');
			// Checked again, from scratch, because this is the hop that matters.
			url = await assertFetchable(new URL(location, url).toString());
			continue;
		}

		if (!response.ok) throw new ValidationError(`That page answered ${response.status}.`);

		const type = response.headers.get('content-type') ?? '';
		if (!/html|xml|json/i.test(type)) throw new ValidationError('That address is not a web page.');

		return await readCapped(response);
	}

	throw new ValidationError('That page redirects too many times.');
}

/**
 * The body, up to the cap.
 *
 * Read in chunks rather than with `.text()`: `.text()` buffers the whole
 * response before anybody can object to its size, so a declared length of two
 * kilobytes and an endless body is a way to exhaust memory.
 */
async function readCapped(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';

	const chunks: Uint8Array[] = [];
	let total = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > MAX_BYTES) {
			await reader.cancel();
			throw new ValidationError('That page is too large to read.');
		}
		chunks.push(value);
	}

	const body = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		body.set(chunk, at);
		at += chunk.length;
	}

	return new TextDecoder('utf-8').decode(body);
}
