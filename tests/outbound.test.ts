/**
 * The guard on outbound requests to addresses users typed.
 *
 * Each refusal here was a working bypass of the old string-match blocklist:
 * an IPv6 literal whose brackets beat the comparison, the hex and decimal
 * spellings of 127.0.0.1, a trailing dot, CGNAT space, a redirect or a DNS
 * answer landing somewhere private after the form-time check had passed.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, test } from 'vitest';

import {
	assertPublicUrl,
	fetchPublic,
	guardedLookup,
	isPrivateAddress
} from '../src/lib/server/outbound';

describe('assertPublicUrl', () => {
	test('accepts the addresses people actually use', () => {
		for (const url of [
			'https://calendar.google.com/calendar/ical/x/basic.ics',
			'http://example.com/feed.ics',
			'https://hooks.example.net:8443/deliver'
		]) {
			expect(() => assertPublicUrl(url, 'calendar address'), url).not.toThrow();
		}
	});

	test('refuses every spelling of "this machine or its network"', () => {
		for (const url of [
			'http://localhost/x',
			'http://localhost./x', // the trailing dot that beat a string match
			'http://sub.localhost/x',
			'http://[::1]/x', // brackets beat `host === '::1'`
			'http://[::]/x',
			'http://[::ffff:127.0.0.1]/x', // IPv4, wearing IPv6
			'http://[fd00::1]/x',
			'http://[fe80::1]/x',
			'http://127.0.0.1/x',
			'http://127.8.9.1/x',
			'http://0x7f000001/x', // hex — the URL parser canonicalises it
			'http://2130706433/x', // decimal
			'http://0177.0.0.1/x', // octal
			'http://0.0.0.0/x',
			'http://10.1.2.3/x',
			'http://100.64.0.1/x', // CGNAT
			'http://169.254.169.254/latest/meta-data',
			'http://172.16.0.9/x',
			'http://192.168.1.50/x',
			'http://192.0.0.192/x',
			'http://198.18.0.1/x',
			'http://224.0.0.1/x',
			'http://255.255.255.255/x',
			'http://box.internal/x',
			'http://printer.local/x',
			'http://router.home.arpa/x'
		]) {
			expect(() => assertPublicUrl(url, 'calendar address'), url).toThrow();
		}
	});

	test('refuses protocols that are not the web', () => {
		for (const url of ['file:///etc/passwd', 'gopher://x/', 'ftp://example.com/x']) {
			expect(() => assertPublicUrl(url, 'webhook address'), url).toThrow();
		}
	});
});

describe('isPrivateAddress', () => {
	test('knows the ranges', () => {
		for (const ip of ['127.0.0.1', '10.0.0.1', '172.31.255.1', '192.168.0.1', '169.254.0.1',
			'100.127.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fdab::1', 'fe80::1', '::ffff:10.0.0.1']) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
		for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.0.1', '2607:f8b0::1', '100.128.0.1']) {
			expect(isPrivateAddress(ip), ip).toBe(false);
		}
	});
});

describe('guardedLookup', () => {
	test('refuses a name that means this machine before resolving anything', async () => {
		await expect(
			new Promise((resolve, reject) =>
				guardedLookup('localhost', {}, (err, address) => (err ? reject(err) : resolve(address)))
			)
		).rejects.toThrow(/names this machine/);
	});
});

describe('fetchPublic', () => {
	let server: Server;
	afterAll(() => server?.close());

	test('will not dial a private address, even one already in a URL', async () => {
		// A live server proves the refusal is the guard, not a dead port.
		server = createServer((_, res) => res.end('secret'));
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as { port: number }).port;

		await expect(fetchPublic(`http://127.0.0.1:${port}/`)).rejects.toThrow();
	});
});
