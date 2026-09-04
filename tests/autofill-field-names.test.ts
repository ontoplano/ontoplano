import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No field may be named something a browser will mistake for a person.
 *
 * Chrome classifies a field by its `name`, `id` and label **before** it reads
 * `autocomplete`, and once it has decided a field belongs to an address it
 * treats `autocomplete="off"` as advisory. So `name="name"` on the New Activity
 * form raised the saved-address suggestions — a row of key, card and pin icons
 * over the phone keyboard — no matter what the attribute said.
 *
 * The shell already stamps every unclaimed field mechanically
 * (`$lib/autofill.ts`), and that is not enough on its own: the name is the
 * signal it cannot reach. This is the other half, and it is a test rather than
 * a note in a comment because the failure is invisible on a desktop browser
 * with nothing saved in it — nobody would notice reintroducing one.
 *
 * The auth pages are exempt by name. A sign-in form *wants* the password
 * manager, and says so with a real `autocomplete` token.
 */
const MAGNETS = [
	'name',
	'email',
	'tel',
	'phone',
	'address',
	'street',
	'city',
	'country',
	'postal',
	'postcode',
	'zip',
	'organization',
	'username',
	'given-name',
	'family-name',
	'cc-number',
	'cc-name',
	/*
	 * `title` is one of these, which is not obvious.
	 *
	 * Chrome's name classifier reads it as an honorific prefix — Mr, Mrs, Dr —
	 * so a task called "title" is, to the autofill heuristic, part of a saved
	 * address profile. It raised the key/card/pin row over the keyboard on the
	 * quick todo form while the idea form beside it, whose field is `content`,
	 * raised nothing at all. Everything that was `title` is `heading` now.
	 */
	'title'
];

/** Where a browser's autofill is welcome, and declared. */
const ALLOWED = ['src/routes/login/', 'src/routes/settings/account/', 'src/routes/demo/'];

function svelteFiles(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) svelteFiles(path, found);
		else if (entry.endsWith('.svelte')) found.push(path);
	}
	return found;
}

describe('form field names', () => {
	it('never hand a browser a field it will read as part of an address', () => {
		const offenders: string[] = [];

		for (const file of [...svelteFiles('src/routes'), ...svelteFiles('src/lib')]) {
			if (ALLOWED.some((prefix) => file.replace(/\\/g, '/').startsWith(prefix))) continue;
			const source = readFileSync(file, 'utf8');
			for (const magnet of MAGNETS) {
				const at = source.indexOf(`name="${magnet}"`);
				if (at === -1) continue;
				// A hidden field carries no keyboard and no suggestion list, and
				// several of them legitimately pass a name back to an action.
				const nearby = source.slice(Math.max(0, at - 200), at);
				if (/type="hidden"/.test(nearby)) continue;
				offenders.push(`${file}: name="${magnet}"`);
			}
		}

		expect(
			offenders,
			`Rename these — "label", "title" or something the form is actually about:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});
