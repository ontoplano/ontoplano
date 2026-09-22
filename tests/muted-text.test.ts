/**
 * `gray-400` is not a text colour here, and this is what says so out loud.
 *
 * The stylesheet has said it in a comment for months — "there is no ground on
 * this site where it clears anything" — and the app kept drawing words in it
 * anyway: a task's number under its row at 11px, a bill's amount, a folder's
 * count, "no price yet". On the page surface that is about 2.5:1, which is
 * roughly half of what small text needs, and it is what somebody meant by
 * "shit's too low contrast in both themes".
 *
 * Two uses of it survive and are fine: an icon, which is a shape rather than a
 * sentence, and the deliberate dimming of something finished or turned off,
 * where being hard to read is the message. Neither can be told apart from a
 * mistake by a regular expression, so this counts them per file instead: a
 * file that gains one has to come past this test, and whoever it stops can
 * decide which of the three it is.
 *
 * Text that should be read is `gray-500` — the token exists for exactly this
 * and is defined as the lightest grey that still clears 4.5:1 on the tinted
 * surface.
 */
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** file → how many uses are there on purpose, and what they are. */
const ALLOWED: Record<string, number> = {
	// Icons.
	'src/lib/components/EmptyState.svelte': 1,
	'src/lib/components/RatingPicker.svelte': 1,
	'src/routes/media/gallery/+page.svelte': 3,
	'src/routes/media/gallery/[id]/+page.svelte': 1,
	'src/routes/reminders/+page.svelte': 2,
	'src/routes/finance/rules/+page.svelte': 1,
	'src/routes/finance/ledgers/+page.svelte': 3,
	// Finished, hidden, or not the chosen one — dimmed on purpose.
	'src/lib/components/Backlinks.svelte': 1,
	'src/lib/components/GoalCard.svelte': 2,
	'src/lib/components/GoalLinksModal.svelte': 1,
	'src/lib/components/NotebookDetail.svelte': 2,
	// One chevron, and two greyings of a finished task.
	'src/lib/components/TodoRows.svelte': 3,
	'src/routes/+page.svelte': 2,
	'src/routes/demo/+page.svelte': 1,
	'src/routes/health/workouts/+page.svelte': 1,
	'src/routes/instance/+page.svelte': 1,
	'src/routes/inventory/+page.svelte': 3,
	'src/routes/settings/preferences/+page.svelte': 1,
	'src/routes/start/+page.svelte': 2,
	// The in-app chat, which is switched off — see `$lib/features`.
	'src/routes/assistant/+page.svelte': 2
};

function everySvelte(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) everySvelte(path, found);
		else if (entry.endsWith('.svelte')) found.push(path);
	}
	return found;
}

describe('the colour words are drawn in', () => {
	test('is never gray-400, beyond the icons and the dimming already there', () => {
		const counted: Record<string, number> = {};
		for (const file of everySvelte('src')) {
			const uses = readFileSync(file, 'utf8').split('text-gray-400').length - 1;
			if (uses > 0) counted[file] = uses;
		}

		const gained = Object.entries(counted)
			.filter(([file, uses]) => uses > (ALLOWED[file] ?? 0))
			.map(([file, uses]) => `${file}: ${uses}, was ${ALLOWED[file] ?? 0}`);

		expect(
			gained,
			'Words drawn in gray-400 are about 2.5:1 on this app’s surfaces. ' +
				'Use gray-500 for text that should be read; if this really is an icon ' +
				'or something dimmed on purpose, raise its count in ALLOWED above.'
		).toEqual([]);
	});

	test('and the list above does not keep names of files that stopped using it', () => {
		const stale = Object.keys(ALLOWED).filter(
			(file) => !readFileSync(file, 'utf8').includes('text-gray-400')
		);
		expect(stale).toEqual([]);
	});
});
