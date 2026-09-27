import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { COLOUR_PALETTE } from '../src/lib/colors.js';

/**
 * The seed's copy of the palette.
 *
 * `scripts/seed-dev.mjs` runs on the demo box with nothing but better-sqlite3
 * beside it, so it cannot import `$lib/colors.ts` and carries the list itself.
 * This is what keeps the copy the same list.
 */
const seed = readFileSync(join(import.meta.dirname, '..', 'scripts', 'seed-dev.mjs'), 'utf8');

describe('the seed palette', () => {
	test('is the app palette, in the same order', () => {
		const block = seed.match(/const PALETTE = \[([^\]]*)\]/);
		expect(block, 'seed-dev.mjs no longer declares `const PALETTE = [...]`').not.toBeNull();
		const colours = [...block![1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1]);
		expect(colours).toEqual([...COLOUR_PALETTE]);
	});
});
