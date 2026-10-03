/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';
import { REVEAL_AHEAD_ROWS, REVEAL_PAGE, Reveal } from './reveal.svelte';

/**
 * Let the scheduled effects run. Not `flushSync`: under vitest `svelte`
 * resolves to its server build, whose `flushSync` does nothing, while the
 * compiled runes use the client's scheduler — which a turn of the loop runs.
 */
const settle = () => new Promise((done) => setTimeout(done));

/** A list of `n` rows, a filter over it, and a Reveal over what passes. */
async function list(n: number) {
	const state = $state({ all: Array.from({ length: n }, (_, i) => i), onlyEven: false });
	const shown = () => state.all.filter((i) => !state.onlyEven || i % 2 === 0);
	let reveal!: Reveal;
	const stop = $effect.root(() => {
		reveal = new Reveal(
			() => shown().length,
			() => state.all.length
		);
	});
	await settle();
	return { state, shown, reveal, stop };
}

describe('a long list drawn a page at a time', async () => {
	test('draws the first page, and the next as it is asked for', async () => {
		const { shown, reveal, stop } = await list(200);
		expect(reveal.of(shown())).toHaveLength(REVEAL_PAGE);
		expect(reveal.trigger).toBe(REVEAL_PAGE - REVEAL_AHEAD_ROWS);
		reveal.more();
		expect(reveal.of(shown())).toHaveLength(2 * REVEAL_PAGE);
		stop();
	});

	test('a row added is drawn too, rather than pushing the last one off', async () => {
		const { state, shown, reveal, stop } = await list(200);
		state.all = [-1, ...state.all];
		await settle();
		expect(reveal.of(shown())).toHaveLength(REVEAL_PAGE + 1);
		stop();
	});

	test('a filter that lets more through does not draw them all', async () => {
		const { state, shown, reveal, stop } = await list(400);
		state.onlyEven = true;
		await settle();
		state.onlyEven = false;
		await settle();
		expect(reveal.of(shown())).toHaveLength(REVEAL_PAGE);
		stop();
	});

	test('a key walking past the drawn end draws far enough to reach it', async () => {
		const { shown, reveal, stop } = await list(200);
		reveal.reach(REVEAL_PAGE - 1);
		expect(reveal.of(shown()).length).toBeGreaterThan(REVEAL_PAGE);
		expect(reveal.trigger).toBeGreaterThan(-1);
		reveal.reach(199);
		expect(reveal.of(shown())).toHaveLength(200);
		expect(reveal.trigger).toBe(-1);
		stop();
	});
});
