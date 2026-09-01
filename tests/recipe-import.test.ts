/**
 * Reading a recipe off somebody else's page, and not becoming a way into the
 * network while doing it.
 *
 * Two halves, tested apart because they fail apart. The parser is pure and gets
 * the shapes real sites actually publish — there are four common ones for the
 * instructions alone. The fetcher is where the danger is: a server that fetches
 * a URL a user supplies reaches everything the box can reach and nothing
 * outside can, which on a rented VPS is the metadata service handing out
 * credentials to anyone who asks.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import {
	minutesFromDuration,
	parseRecipeFromHtml,
	plainText,
	servingsFrom
} from '../src/lib/recipe-import';
import { isPrivateAddress } from '../src/lib/server/services/recipe-fetch';

/** A page with one JSON-LD block holding `recipe`. */
const page = (recipe: unknown, extra = '') =>
	`<!doctype html><html><head><title>A blog</title>${extra}
	<script type="application/ld+json">${JSON.stringify(recipe)}</script>
	</head><body></body></html>`;

const soup = {
	'@context': 'https://schema.org',
	'@type': 'Recipe',
	name: 'Leek and potato soup',
	recipeIngredient: ['3 leeks, sliced', '500g potatoes', '1L stock'],
	recipeInstructions: 'Sweat the leeks. Add everything else. Blend.',
	recipeYield: '4 servings',
	totalTime: 'PT45M'
};

describe('the fields a page carries', () => {
	test('a plain Recipe block is read whole', () => {
		const out = parseRecipeFromHtml(page(soup))!;
		expect(out.title).toBe('Leek and potato soup');
		expect(out.ingredients).toHaveLength(3);
		expect(out.ingredients[0]).toBe('3 leeks, sliced');
		expect(out.servings).toBe(4);
		expect(out.minutes).toBe(45);
	});

	test('and so is one buried in a @graph, which is how most sites ship it', () => {
		const out = parseRecipeFromHtml(
			page({
				'@context': 'https://schema.org',
				'@graph': [{ '@type': 'WebSite', name: 'A blog' }, { '@type': 'Article' }, soup]
			})
		)!;
		expect(out.title).toBe('Leek and potato soup');
	});

	test('or in a bare array', () => {
		expect(parseRecipeFromHtml(page([{ '@type': 'Person' }, soup]))!.ingredients).toHaveLength(3);
	});

	test('a broken block does not lose a good one beside it', () => {
		// Pages routinely carry three or four and one of them is malformed.
		const html = `<script type="application/ld+json">{ oops, </script>${page(soup)}`;
		expect(parseRecipeFromHtml(html)!.title).toBe('Leek and potato soup');
	});
});

describe('the instructions, in all four shapes sites use', () => {
	const method = (recipeInstructions: unknown) =>
		parseRecipeFromHtml(page({ ...soup, recipeInstructions }))!.method;

	test('a string', () => {
		expect(method('Chop. Cook.')).toBe('Chop. Cook.');
	});

	test('a list of strings', () => {
		expect(method(['Chop.', 'Cook.'])).toBe('Chop.\n\nCook.');
	});

	test('a list of HowToStep', () => {
		expect(
			method([
				{ '@type': 'HowToStep', text: 'Chop.' },
				{ '@type': 'HowToStep', text: 'Cook.' }
			])
		).toBe('Chop.\n\nCook.');
	});

	test('and sections, each holding its own steps', () => {
		expect(
			method([
				{
					'@type': 'HowToSection',
					name: 'The soup',
					itemListElement: [{ '@type': 'HowToStep', text: 'Chop.' }]
				},
				{
					'@type': 'HowToSection',
					itemListElement: [{ '@type': 'HowToStep', text: 'Cook.' }]
				}
			])
		).toBe('Chop.\n\nCook.');
	});

	test('markup inside a step comes out as text', () => {
		expect(method('<p>Chop the <b>leeks</b>.</p><p>Cook &amp; blend.</p>')).toBe(
			'Chop the leeks.\n\nCook & blend.'
		);
	});
});

describe('a page this cannot read', () => {
	test('with no structured data at all is refused rather than guessed at', () => {
		// Inventing a title from <title> with no ingredients under it would be
		// worse than saying so: an empty recipe looks like a working import.
		expect(parseRecipeFromHtml('<html><title>Soup</title><body>Some prose.</body></html>')).toBe(
			null
		);
	});

	test('and an Article that is not a recipe is not one', () => {
		expect(parseRecipeFromHtml(page({ '@type': 'Article', name: 'On soup' }))).toBe(null);
	});

	test('and a Recipe listing nothing is not importable', () => {
		expect(parseRecipeFromHtml(page({ '@type': 'Recipe', name: 'Soup' }))).toBe(null);
	});
});

describe('the awkward small fields', () => {
	test('durations, including the ones spanning a day', () => {
		expect(minutesFromDuration('PT30M')).toBe(30);
		expect(minutesFromDuration('PT1H30M')).toBe(90);
		expect(minutesFromDuration('PT2H')).toBe(120);
		// A brine or a dough. Dropping the day would make two days two hours.
		expect(minutesFromDuration('P1DT2H')).toBe(26 * 60);
		expect(minutesFromDuration('later')).toBe(null);
		expect(minutesFromDuration('PT0M')).toBe(null);
	});

	test('prep plus cook when there is no total', () => {
		const out = parseRecipeFromHtml(
			page({ ...soup, totalTime: undefined, prepTime: 'PT20M', cookTime: 'PT40M' })
		)!;
		// "40 minutes" on a recipe needing twenty minutes of chopping first is
		// the number that makes people give up half way.
		expect(out.minutes).toBe(60);
	});

	test('servings, however the site phrased it', () => {
		expect(servingsFrom(4)).toBe(4);
		expect(servingsFrom('4')).toBe(4);
		expect(servingsFrom('Serves 4-6')).toBe(4);
		expect(servingsFrom(['6 servings', '6'])).toBe(6);
		expect(servingsFrom('a few')).toBe(null);
	});

	test('entities and tags in a title', () => {
		expect(plainText('Mac &amp; cheese &#8212; the good one')).toBe('Mac & cheese — the good one');
	});
});

/**
 * The half that can hurt somebody.
 *
 * Every one of these is an address that reaches something the box can see and
 * the internet cannot: the cloud metadata service, the router, a NAS, this
 * app's own port. `isPrivateAddress` is what stands between a pasted URL and
 * all of it, so it is checked exhaustively rather than representatively.
 */
describe('addresses the server must refuse to fetch', () => {
	test('loopback, in every spelling', () => {
		for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1'])
			expect(isPrivateAddress(address), address).toBe(true);
	});

	test('the cloud metadata service, which is the one that hands out credentials', () => {
		expect(isPrivateAddress('169.254.169.254')).toBe(true);
		expect(isPrivateAddress('169.254.0.1')).toBe(true);
	});

	test('every private range, including the ones people forget', () => {
		for (const address of [
			'10.0.0.1',
			'172.16.0.1',
			'172.31.255.255',
			'192.168.1.1',
			'100.64.0.1', // carrier-grade NAT
			'0.0.0.0',
			'224.0.0.1', // multicast
			'255.255.255.255'
		])
			expect(isPrivateAddress(address), address).toBe(true);
	});

	test('IPv6 loopback, link-local, unique-local and multicast', () => {
		for (const address of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1'])
			expect(isPrivateAddress(address), address).toBe(true);
	});

	test('an IPv4 address wearing an IPv6 hat is still that address', () => {
		expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
		expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
	});

	test('anything that is not an address at all is refused rather than guessed', () => {
		for (const value of ['', 'localhost', 'not-an-address', '999.1.1.1'])
			expect(isPrivateAddress(value), value).toBe(true);
	});

	test('and a real public address is allowed, or nothing could be imported', () => {
		for (const address of ['1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '2606:4700::1'])
			expect(isPrivateAddress(address), address).toBe(false);
	});
});

/**
 * And the check that stands in front of the fetch, exercised directly.
 *
 * The end-to-end test asserts a refusal, but a refusal is also what a machine
 * with no outbound network produces — so it could pass for the wrong reason
 * forever. This calls the guard itself: `localhost` and the literal addresses
 * resolve without touching a network, so a rejection here can only be the
 * guard rejecting them.
 */
describe('the guard in front of the fetch', () => {
	let fetcher: typeof import('../src/lib/server/services/recipe-fetch');

	beforeAll(async () => {
		fetcher = await import('../src/lib/server/services/recipe-fetch');
	});

	test('refuses a name that resolves to the inside', async () => {
		await expect(fetcher.assertFetchable('http://localhost:1493/')).rejects.toThrow(
			/not reachable/i
		);
	});

	test('refuses the metadata service and the loopback address', async () => {
		for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:1493/'])
			await expect(fetcher.assertFetchable(url), url).rejects.toThrow(/not reachable/i);
	});

	test('refuses a scheme that is not the web', async () => {
		for (const url of ['file:///etc/passwd', 'gopher://x/', 'ftp://x/'])
			await expect(fetcher.assertFetchable(url), url).rejects.toThrow(/http and https/i);
	});

	test('and says the same thing about every refused address', async () => {
		// "That is the metadata service" and "that is a private address" would
		// together map somebody's network one guess at a time.
		const messages = await Promise.all(
			['http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/'].map((url) =>
				fetcher.assertFetchable(url).catch((e: Error) => e.message)
			)
		);
		expect(new Set(messages).size).toBe(1);
	});

	test('and lets a real public address through to the fetch', async () => {
		// No network needed: this only asserts the guard returns rather than
		// throwing. 1.1.1.1 is a literal, so there is no lookup either.
		await expect(fetcher.assertFetchable('https://1.1.1.1/recipe')).resolves.toBeInstanceOf(URL);
	});
});
