/**
 * @vitest-environment happy-dom
 *
 * Keeping the password manager off fields that are not passwords.
 *
 * This has been "fixed" three times, and each time the thing that broke was
 * invisible on a developer's browser with nothing saved in it: the icons only
 * appear for somebody who has an address and a card in Chrome. Nobody was ever
 * going to notice a regression by looking.
 *
 * So the mechanism is pinned here instead. What it has to do:
 *
 *  · stamp every field that has NOT declared what it is;
 *  · leave a field that HAS declared itself alone, so the sign-in form still
 *    gets the password manager it wants;
 *  · reach a field added later, by a dialog opening — including one that is
 *    itself the added node, which is the gap that let New Activity through;
 *  · stamp the form as well as the fields, because Chrome classifies a form
 *    as a whole.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { suppressAutofill } from '../src/lib/autofill';

let stop: (() => void) | null = null;

afterEach(() => {
	stop?.();
	stop = null;
	document.body.innerHTML = '';
});

function mount(html: string) {
	document.body.innerHTML = html;
	stop = suppressAutofill(document.body);
}

const flags = ['data-form-type', 'data-lpignore', 'data-1p-ignore', 'data-bwignore'];

/** What the DOM looks like after a mutation the observer has to notice. */
function settle() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a field that says nothing about itself', () => {
	test('is stamped, attribute and manager flags alike', () => {
		mount('<form><input name="label" /></form>');
		const field = document.querySelector('input')!;

		expect(field.getAttribute('autocomplete')).toBe('off');
		for (const flag of flags) expect(field.hasAttribute(flag), flag).toBe(true);
	});

	test('gets an id, so the classifier has one signal fewer', () => {
		mount('<form><input name="label" /></form>');
		expect(document.querySelector('input')!.id).toBeTruthy();
	});

	test('and a textarea is a field too', () => {
		mount('<form><textarea name="notes"></textarea></form>');
		const field = document.querySelector('textarea')!;
		expect(field.getAttribute('autocomplete')).toBe('off');
	});
});

describe('a field that has declared itself', () => {
	test('is left exactly as it is', () => {
		// The sign-in form wants the password manager. Stamping it would break
		// the one place autofill is the right behaviour.
		mount('<form><input name="password" autocomplete="current-password" /></form>');
		const field = document.querySelector('input')!;

		expect(field.getAttribute('autocomplete')).toBe('current-password');
		for (const flag of flags) expect(field.hasAttribute(flag), flag).toBe(false);
	});

	test('but one that only wrote autocomplete="off" by hand still gets the flags', () => {
		// `off` is a hint Chrome may ignore; the flags are what the managers read.
		mount('<form><input name="label" autocomplete="off" /></form>');
		const field = document.querySelector('input')!;
		for (const flag of flags) expect(field.hasAttribute(flag), flag).toBe(true);
	});
});

describe('the form around them', () => {
	test('is stamped too, because a form is classified as a whole', () => {
		mount('<form><input name="label" /></form>');
		const form = document.querySelector('form')!;
		expect(form.getAttribute('autocomplete')).toBe('off');
		for (const flag of flags) expect(form.hasAttribute(flag), flag).toBe(true);
	});
});

describe('a field that arrives later', () => {
	test('is stamped when a dialog mounts around it', async () => {
		mount('<div id="app"></div>');

		const dialog = document.createElement('div');
		dialog.innerHTML = '<form><input name="label" /></form>';
		document.querySelector('#app')!.appendChild(dialog);
		await settle();

		expect(document.querySelector('input')!.getAttribute('autocomplete')).toBe('off');
	});

	test('is stamped when the added node IS the field', async () => {
		// The gap that let New Activity through: `querySelectorAll` never
		// returns the element it is called on, so a field added on its own — or
		// as a dialog's own root — was walked straight past.
		mount('<form id="host"></form>');

		const field = document.createElement('input');
		field.name = 'label';
		document.querySelector('#host')!.appendChild(field);
		await settle();

		expect(field.getAttribute('autocomplete')).toBe('off');
		for (const flag of flags) expect(field.hasAttribute(flag), flag).toBe(true);
	});

	test('is left alone once the observer is stopped', async () => {
		mount('<div id="app"></div>');
		stop?.();
		stop = null;

		const field = document.createElement('input');
		field.name = 'label';
		document.querySelector('#app')!.appendChild(field);
		await settle();

		expect(field.hasAttribute('autocomplete')).toBe(false);
	});
});
