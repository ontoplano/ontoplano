/**
 * Reading a recipe out of what somebody pasted.
 *
 * The parser is pure and gets the shapes real sites actually publish — there
 * are four common ones for the instructions alone. Nothing here touches the
 * network, and that is deliberate rather than incidental: this used to be fed
 * by the server fetching a URL, which is a way into everything the box can
 * reach and nothing outside it can. The paste costs one step and closes that
 * door outright.
 */
import { describe, expect, test } from 'vitest';
import {
	minutesFromDuration,
	parseRecipeFromHtml,
	plainText,
	servingsFrom
} from '../src/lib/recipe-import';

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
 * What a person actually pastes.
 *
 * Two shapes reach the box: the page source, and the structured-data block on
 * its own, from somebody who went looking in the source and copied the part
 * that mattered. Both are the same object once parsed.
 */
describe('a paste, in the two shapes it arrives in', () => {
	test('the whole page source', () => {
		expect(parseRecipeFromHtml(page(soup))?.title).toBe('Leek and potato soup');
	});

	test('the JSON-LD block on its own', () => {
		const found = parseRecipeFromHtml(JSON.stringify(soup));
		expect(found?.title).toBe('Leek and potato soup');
		expect(found?.ingredients).toHaveLength(3);
	});

	test('an array of blocks, as a page can carry', () => {
		const found = parseRecipeFromHtml(JSON.stringify([{ '@type': 'WebPage' }, soup]));
		expect(found?.title).toBe('Leek and potato soup');
	});

	test('a paste that is neither is not a recipe', () => {
		expect(parseRecipeFromHtml('3 leeks\n500g potatoes')).toBeNull();
		expect(parseRecipeFromHtml('{ broken json')).toBeNull();
	});
});
