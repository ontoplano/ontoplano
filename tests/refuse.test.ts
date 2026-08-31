/**
 * What a refused write looks like from the other end.
 *
 * A hook cannot call `fail()` — the action it belongs to never runs — and the
 * obvious `new Response('no', { status: 403 })` is worse than it looks: nearly
 * every form here is `use:enhance`, which parses the body as an action result,
 * so a plain-text refusal arrives as
 *
 *     500 · JSON.parse: unexpected character at line 1 column 1
 *
 * That is what "the demo cannot delete its account" looked like from the
 * outside. The envelope below is the one SvelteKit itself writes for a
 * `fail()`, which is what makes an existing page show the sentence.
 */
import { describe, expect, test } from 'vitest';
import { parse } from 'devalue';

import { refuse } from '../src/lib/server/refuse';

const post = (headers: Record<string, string> = {}) =>
	new Request('https://example.test/admin', { method: 'POST', headers });

describe('refusing a write', () => {
	test('answers an enhanced form with a failure it can render', async () => {
		const response = refuse(post({ 'x-sveltekit-action': 'true' }), 'This is the demo.');

		expect(response.status).toBe(403);
		const body = (await response.json()) as { type: string; status: number; data: string };
		expect(body.type).toBe('failure');
		expect(body.status).toBe(403);

		// `data` is devalue, exactly as SvelteKit encodes an action's `fail()`.
		expect(parse(body.data)).toEqual({ message: 'This is the demo.', refused: true });
	});

	test('and everything else with the sentence as text', async () => {
		const response = refuse(post(), 'This is the demo.');

		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(await response.text()).toContain('This is the demo.');
	});

	test('carries whatever status it was given', async () => {
		expect(refuse(post(), 'Slow down', 429).status).toBe(429);
	});
});
