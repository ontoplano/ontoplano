/**
 * The mark on the chooser and the mark on the bar are one object.
 *
 * Choosing an instance replaces a screen that has no app around it with one
 * that does — and the mark is in both. If the two are drawn from different
 * numbers they land a few pixels apart, which reads as the logo jumping at
 * the exact moment somebody commits to an answer.
 *
 * So the chooser positions its mark from `--bar-mark-bottom`, which is
 * derived from the four numbers that put the bar's mark where it is. This
 * fails if either side stops using them — the arithmetic is the contract, and
 * an e2e can only catch it after somebody has already seen it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/routes/layout.css', 'utf8');
const chooser = readFileSync('src/routes/instance/+page.svelte', 'utf8');
const shell = readFileSync('src/routes/+layout.svelte', 'utf8');

describe('the mark on the chooser', () => {
	it('is placed from the bar mark’s own measurements', () => {
		const rule = /--bar-mark-bottom:\s*calc\(([^;]+)\);/s.exec(sheet)?.[1] ?? '';
		expect(rule, '--bar-mark-bottom is defined').toBeTruthy();
		// Every number that decides where the bar's mark sits, and nothing
		// typed in beside them.
		for (const part of ['--safe-bottom', '--mobile-nav-height', '--bar-mark-rise', '--bar-mark']) {
			expect(rule, `${part} is part of it`).toContain(part);
		}
	});

	it('uses that placement rather than a number of its own', () => {
		expect(chooser).toContain('mark-where-the-bar-will-be');
		const placed = /\.mark-where-the-bar-will-be\s*\{[^}]*\}/gs.exec(sheet)?.[0] ?? '';
		expect(placed, 'the class is defined').toBeTruthy();
		expect(placed, 'it is the bar mark’s size').toContain('var(--bar-mark)');
	});

	it('is the same size the bar draws', () => {
		// The bar's button takes its size from the variable too — if it ever
		// goes back to a literal, the two drift and nothing else notices.
		expect(shell).toContain('var(--bar-mark)');
	});
});
