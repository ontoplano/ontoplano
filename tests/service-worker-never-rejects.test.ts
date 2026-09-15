/**
 * Nothing the service worker answers may reject.
 *
 * `respondWith` takes a promise. If that promise rejects, the browser records
 * a network error for the request and logs one into the page's console —
 * which is a console error the app did not choose to make, about a request
 * that may simply have been abandoned when somebody navigated away.
 *
 * That is exactly how it turned up: the asset branch was the one `respondWith`
 * without a `.catch`, a navigation aborted an asset request in flight, and
 * `smoke.e2e.ts` failed with "TypeError: Failed to fetch" on a slow machine
 * and nowhere else. The branch is easy to add and easy to add without a catch,
 * so this counts them rather than trusting the next person to notice.
 *
 * Source-level on purpose: a service worker needs a service worker to run in,
 * and the thing worth holding is a property of the code — every answer ends in
 * a fallback — not the behaviour of one branch under one failure.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worker = readFileSync('src/service-worker.ts', 'utf8');

/**
 * The argument of each `event.respondWith(...)`, brackets balanced.
 *
 * A regex cannot match nested parentheses, and these are several lines of
 * chained promises — so this walks the characters instead.
 */
function answers(source: string): string[] {
	const found: string[] = [];
	const opener = 'event.respondWith(';

	for (let at = source.indexOf(opener); at !== -1; at = source.indexOf(opener, at + 1)) {
		let depth = 0;
		let i = at + opener.length - 1;
		const from = i + 1;
		for (; i < source.length; i += 1) {
			if (source[i] === '(') depth += 1;
			else if (source[i] === ')') {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		found.push(source.slice(from, i));
	}
	return found;
}

describe('every answer the service worker gives', () => {
	const given = answers(worker);

	it('there are some to check', () => {
		// If this ever reads zero the walker has broken, and every assertion
		// below would pass by doing nothing.
		expect(given.length).toBeGreaterThan(2);
	});

	it('ends in a catch, so a request abandoned mid-flight is not an error', () => {
		for (const [i, answer] of given.entries()) {
			expect(
				answer,
				`respondWith #${i + 1} has no .catch:\n${answer.trim().slice(0, 200)}`
			).toMatch(/\.catch\(/);
		}
	});

	it('and the asset branch answers from the cache when the network is gone', () => {
		const asset = given.find((a) => a.includes('caches.match(request)'));
		expect(asset, 'the asset branch is there').toBeTruthy();
		// Its catch has to try the cache again rather than only inventing a
		// response: an abandoned request for something already stored should
		// still be answered with the stored copy.
		const inCatch = /\.catch\(([\s\S]*)\)$/.exec(asset!.trim())?.[1] ?? '';
		expect(inCatch).toContain('caches.match(request)');
	});
});
