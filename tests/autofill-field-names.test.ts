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

/**
 * The element decides it, not the attributes.
 *
 * Android's autofill service offers its key/card/pin bar over an `<input>` and
 * never over a `<textarea>`. Nothing reaches that: the quick todo form carried
 * `autocomplete="off"`, every ignore flag `$lib/autofill` stamps, and a field
 * name no classifier reads as an address — and still raised the bar, while the
 * idea form beside it, identical but for leading with a textarea, never did.
 *
 * So the four quick-capture forms lead with a textarea. `OneLine.svelte` is the
 * one that looks and behaves like a single-line field, and this is what stops
 * somebody putting a plain `<input>` back.
 */
describe('the quick capture forms', () => {
	const LEADS = [
		'src/lib/components/fields/TodoFields.svelte',
		'src/lib/components/fields/IdeaFields.svelte',
		'src/lib/components/fields/NoteFields.svelte',
		'src/lib/components/fields/BuyFields.svelte'
	];

	it('lead with something Android will not offer an address over', () => {
		const offenders: string[] = [];

		for (const file of LEADS) {
			const source = readFileSync(file, 'utf8');
			// The first field in the file is the lead one: the single thing the
			// phone shows before "more options".
			const firstInput = source.indexOf('<input');
			const firstTextarea = source.indexOf('<textarea');
			const firstOneLine = source.indexOf('<OneLine');

			const first = [firstInput, firstTextarea, firstOneLine]
				.filter((at) => at !== -1)
				.sort((a, b) => a - b)[0];

			if (first === firstInput) offenders.push(file);
		}

		expect(
			offenders,
			`These lead with an <input>, which puts the autofill bar over the keyboard.\nUse <OneLine> or a textarea:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});

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

/**
 * And nothing new gets to be a plain `<input type="text">`.
 *
 * This is the rule that kept being re-broken. `$lib/autofill` stamps every
 * ignore flag a password manager reads, a test above forbids every field name
 * a classifier reads as an address, and Android's own service still put its
 * key/card/pin bar over the keyboard — because it decides on the ELEMENT, and
 * no attribute reaches that. `OneLine.svelte` is a textarea that behaves like
 * an input, and it was used by four forms while sixty other fields stayed
 * inputs and stayed broken.
 *
 * So the default is mechanical now: a single-line free-text field is a
 * `OneLine`, and writing an `<input type="text">` fails here rather than
 * turning up in a screenshot. The exceptions are listed, and each is a field
 * that is not free text or genuinely wants the browser's help.
 */
describe('single-line free text', () => {
	/** Files whose text inputs are deliberate, and why. */
	const EXEMPT_FILES: Record<string, string> = {
		// A sign-in form wants the password manager, and says so with real
		// `autocomplete` tokens.
		'src/routes/login/+page.svelte': 'auth',
		'src/routes/settings/account/+page.svelte': 'auth',
		'src/routes/welcome/password/+page.svelte': 'auth',
		// The component this rule is about.
		'src/lib/components/OneLine.svelte': 'the replacement itself',
		// A combobox with its own listbox and keyboard handling.
		'src/lib/components/TimezonePicker.svelte': 'combobox'
	};

	/** Field names that are not free text, wherever they appear. */
	const EXEMPT_NAMES = new Set([
		// Money, typed and parsed as money rather than as words.
		'amount',
		'price',
		'paid',
		// A date in two shapes, with its own hint and pattern.
		'bornOn',
		// These complete from a `<datalist>`, which a textarea cannot have.
		'people',
		'unit'
	]);

	it('is a OneLine, not an input', () => {
		const offenders: string[] = [];

		for (const file of [...svelteFiles('src/routes'), ...svelteFiles('src/lib')]) {
			const path = file.replace(/\\/g, '/');
			if (path in EXEMPT_FILES) continue;
			const source = readFileSync(file, 'utf8');

			for (const tag of source.match(/<input\b[^>]*?\/?>/gs) ?? []) {
				const type = /type="([^"]+)"/.exec(tag);
				// A date, a number, a checkbox, a file: the browser draws the
				// control, and none of them raise the bar.
				if (type && type[1] !== 'text') continue;
				// A datalist is the one thing a textarea cannot carry.
				if (tag.includes('list="')) continue;
				const name = /name="([^"]+)"/.exec(tag);
				if (!name || EXEMPT_NAMES.has(name[1])) continue;
				offenders.push(`${path}: name="${name[1]}"`);
			}
		}

		expect(
			offenders,
			`These raise the autofill bar over the keyboard on Android. Use <OneLine>,\nor add the field to EXEMPT_NAMES here with the reason it is not free text:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});
