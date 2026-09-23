import { describe, expect, test } from 'vitest';
import { versionsSaid } from '../scripts/build-badges.mjs';

/**
 * Which numbers in a badge are versions.
 *
 * Almost none of them. An SVG is mostly geometry, and reading the whole file
 * for `N.N` found path coordinates — `14.5` parsed as version fourteen, newer
 * than anything this project will ever ship. Every badge therefore looked like
 * it had come from a newer clone, was never rewritten, and `--check` never
 * said a word: the release badge sat five versions out of date through as many
 * releases, each one running `make badges` and being told to fetch its tags.
 */
describe('the versions a badge says', () => {
	test('is the one it prints', () => {
		expect(versionsSaid('<svg><text>v0.181.3</text></svg>')).toEqual(['0.181.3']);
	});

	test('and not the geometry it is drawn from', () => {
		const svg =
			'<svg viewBox="0 0 104.5 20"><path d="M14.5 3.5a2.5 2.5 0 0 1 2.25 1.75"/>' +
			'<text>v0.176.10</text></svg>';
		expect(versionsSaid(svg)).toEqual(['0.176.10']);
	});

	test('nor a bare number sitting in the text', () => {
		// A badge saying "2.5 kB" is not a badge about version 2.5.
		expect(versionsSaid('<svg><text>2.5 kB</text></svg>')).toEqual([]);
	});

	test('a badge that names no version names none', () => {
		expect(versionsSaid('<svg><text>host it</text></svg>')).toEqual([]);
	});
});
