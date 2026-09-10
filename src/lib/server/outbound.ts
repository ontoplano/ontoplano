/**
 * Outbound requests to addresses users typed.
 *
 * A calendar feed, a webhook, a push endpoint: each is a URL somebody wrote in
 * a form, fetched from wherever this server sits — which is exactly the shape
 * of a request-forgery hole. "Call 169.254.169.254" is a probe, not a feed.
 *
 * The old defence was a string match on the hostname at save time, and every
 * one of its gaps was real: a public URL that 302s to `127.0.0.1` (the check
 * never saw the redirect), a public name with a private A record (the name was
 * never resolved), `[::1]` (the brackets beat the comparison), `0x7f000001`
 * and friends (never dotted-decimal).
 *
 * So the check moved to where the connection is made. `publicDispatcher` puts
 * a guard inside the dialer itself: an IP-literal host is checked before
 * dialing, a name is resolved and the *resolved* addresses are checked, and
 * the socket then dials exactly what was checked — every redirect hop makes a
 * fresh connection through the same guard, and there is no gap between
 * checking a name and connecting to it for DNS to change its mind in.
 *
 * `assertPublicUrl` remains as the save-time half: it answers the person while
 * they are still looking at the form. It is a courtesy, not the boundary.
 */
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, buildConnector, fetch as guardedFetch, type Dispatcher } from 'undici';

import { ValidationError } from './services/errors.js';

/** `[::1]` → `::1`, `localhost.` → `localhost`, case folded. */
function canonicalHost(raw: string): string {
	return raw.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/**
 * Whether an IP address points anywhere but the public internet.
 *
 * IPv4 arrives in dotted-decimal — the WHATWG URL parser canonicalises the
 * decimal, hex and octal spellings, and the resolver only ever hands back
 * canonical forms — so ranges can be matched on the string.
 */
export function isPrivateAddress(raw: string): boolean {
	const ip = canonicalHost(raw);

	// An IPv6-mapped IPv4 address is judged as the IPv4 address it carries —
	// in either spelling, since the URL parser writes `::ffff:127.0.0.1` as
	// `::ffff:7f00:1` while a resolver hands back the dotted form.
	const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPrivateAddress(mapped[1]);
	const packed = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (packed) {
		const [hi, lo] = [parseInt(packed[1], 16), parseInt(packed[2], 16)];
		return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
	}

	if (isIP(ip) === 4) {
		const [a, b] = ip.split('.').map(Number);
		return (
			a === 0 || // "this network", and 0.0.0.0 in particular
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) || // CGNAT
			(a === 169 && b === 254) || // link-local, where cloud metadata lives
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0) || // 192.0.0/24 protocol assignments
			(a === 198 && (b === 18 || b === 19)) || // benchmarking
			a >= 224 // multicast and reserved
		);
	}

	if (isIP(ip) === 6) {
		if (ip === '::' || ip === '::1') return true;
		return /^(f[cd]|fe[89ab])/.test(ip); // unique-local fc00::/7, link-local fe80::/10
	}

	return false;
}

/** Names that mean "this machine" or "this network" without resolving. */
function isPrivateName(host: string): boolean {
	return (
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal') ||
		host.endsWith('.home.arpa')
	);
}

/**
 * The form-time check: http(s), and not visibly private.
 *
 * `what` names the thing in the refusal — "calendar address", "webhook
 * address" — because the message lands under the field somebody just filled.
 */
export function assertPublicUrl(raw: string, what: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new ValidationError(`That is not a URL this ${what} can use`);
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:')
		throw new ValidationError(`A ${what} has to be http or https`);

	const host = canonicalHost(url.hostname);
	if (isPrivateName(host) || (isIP(host) && isPrivateAddress(host)))
		throw new ValidationError(
			`That address points back at this machine or its network, so it will not be used`
		);

	return url;
}

/**
 * The resolver the guarded dialer uses: resolve, judge what came back, and
 * hand the dialer only addresses that were judged. Exported for its test.
 */
export function guardedLookup(
	hostname: string,
	options: Parameters<typeof dnsLookup>[1],
	callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
	if (isPrivateName(canonicalHost(hostname))) {
		callback(new Error(`refusing to resolve ${hostname}: it names this machine`), '', 0);
		return;
	}
	dnsLookup(hostname, options as never, ((err: NodeJS.ErrnoException | null, address: unknown, family: number) => {
		if (err) return callback(err, '', 0);
		const all = Array.isArray(address)
			? (address as { address: string }[]).map((a) => a.address)
			: [String(address)];
		if (all.some((a) => isPrivateAddress(a)))
			return callback(new Error(`refusing ${hostname}: it resolves to a private address`), '', 0);
		callback(null, address as string, family);
	}) as never);
}

const inner = buildConnector({ lookup: guardedLookup as never });

/**
 * A dialer that will not touch this machine or its network. The IP-literal
 * case is checked here because a dialer given an address has no reason to
 * call any resolver at all.
 */
const guardedConnector: buildConnector.connector = (opts, cb) => {
	const host = canonicalHost(String(opts.hostname ?? ''));
	if (isIP(host) && isPrivateAddress(host)) {
		cb(new Error(`refusing to connect to ${host}: it is a private address`), null);
		return;
	}
	inner(opts, cb);
};

export const publicDispatcher: Dispatcher = new Agent({ connect: guardedConnector });

/**
 * `fetch`, for a URL a user typed.
 *
 * Same call shape as the global one, with the guarded dialer underneath —
 * which is the point: the safe spelling is the short one, and forgetting the
 * guard means writing *more* code, not less.
 */
export function fetchPublic(
	url: string,
	init?: Omit<RequestInit, 'dispatcher'>
): ReturnType<typeof guardedFetch> {
	return guardedFetch(url, { ...(init as object), dispatcher: publicDispatcher } as never);
}
