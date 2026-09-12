/**
 * A sideways swipe stays in the thing being swiped.
 *
 * Pushing a horizontal strip past its end hands the rest of the gesture to the
 * page, and a web view drags the whole screen sideways and leaves it there.
 * The notebooks room looked like it had a layout too wide for the phone; it
 * did not — measuring found no overflow at any phone width — the tab strip was
 * handing the swipe on.
 *
 * Pinned as source because the failure needs a real touch screen to see: no
 * headless viewport reproduces an overscroll chain, and the rule protecting
 * against it is one line that is easy to lose.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const sheet = readFileSync('src/routes/layout.css', 'utf8');

describe('horizontal scrollers', () => {
	test('contain their overscroll by default, not one by one', () => {
		// Against the utility itself, so a scroller added tomorrow is covered
		// without anybody remembering this rule.
		const rule = sheet.match(/\[class~='overflow-x-auto'\][^}]*}/s);
		expect(rule?.[0]).toContain('overscroll-behavior-x: contain');
	});

	test('and the named strips are covered too', () => {
		const rule = sheet.match(/\[class~='overflow-x-auto'\][^}]*}/s)?.[0] ?? '';
		for (const selector of ['.scroll-hints', '.snap-strip', '.md pre'])
			expect(rule, selector).toContain(selector);
	});
});
