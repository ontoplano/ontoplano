/**
 * @vitest-environment happy-dom
 *
 * The small behaviours attached to elements.
 *
 * `settingsForm` is here because of a reported bug: tweaking the Sections list
 * and saving it unchecked every box, and the page only told the truth again
 * after a reload. SvelteKit's `enhance` resets a form after a successful
 * submit — right for a form you fill in, wrong for one whose controls are drawn
 * from stored state, because `reset()` returns each control to its HTML
 * attribute default while Svelte set `checked` as a property.
 *
 * That is a one-line difference (`reset: false`) that nothing on screen
 * distinguishes until somebody saves their settings and watches them empty. So
 * it is pinned here rather than left to be noticed again.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * `enhance` is SvelteKit's, and what matters is what gets handed back to it —
 * so it is captured rather than run.
 */
const enhance = vi.fn((node: HTMLFormElement, submit: unknown) => ({ node, submit }));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: unknown) => enhance(node, submit)
}));

const { settingsForm } = await import('../src/lib/actions/settings-form');
const { autofocus, focusHere } = await import('../src/lib/actions/autofocus');
const { reveal } = await import('../src/lib/actions/reveal');
const { autogrow } = await import('../src/lib/actions/autogrow');
const { notices } = await import('../src/lib/notify.svelte');

afterEach(() => {
	document.body.innerHTML = '';
	notices.items.length = 0;
	enhance.mockClear();
	vi.unstubAllGlobals();
});

/** Run the submit handler `settingsForm` registered, with a given result. */
async function submitWith(result: Record<string, unknown>, options = {}) {
	document.body.innerHTML = '<form></form>';
	settingsForm(document.querySelector('form')!, options);

	const [, submit] = enhance.mock.calls[0] as [HTMLFormElement, () => unknown];
	const update = vi.fn();
	// `enhance` hands back a function that returns the callback run on response.
	const onResponse = (await submit()) as (arg: unknown) => Promise<void>;
	await onResponse({ result, update });
	return update;
}

describe('a form that shows stored state', () => {
	test('is updated without being reset', async () => {
		// The bug: `reset()` empties a form whose controls came from `data`.
		const update = await submitWith({ type: 'success' });
		expect(update).toHaveBeenCalledWith({ reset: false });
	});

	test('says it saved, where the button was pressed', async () => {
		// A settings page is long, and a confirmation drawn above the first card
		// is invisible to somebody who scrolled to the last one.
		await submitWith({ type: 'success' }, { notice: 'Sections saved.' });
		expect(notices.items.map((n) => n.message)).toEqual(['Sections saved.']);
	});

	test('and says nothing when it was not asked to', async () => {
		await submitWith({ type: 'success' });
		expect(notices.items).toHaveLength(0);
	});

	test('repeats what the server said when a save failed', async () => {
		await submitWith({ type: 'failure', data: { message: 'That name is taken.' } });
		expect(notices.items[0]).toMatchObject({ kind: 'error', message: 'That name is taken.' });
	});

	test('and still says something when the server said nothing useful', async () => {
		await submitWith({ type: 'failure', data: {} });
		expect(notices.items[0]).toMatchObject({ kind: 'error', message: 'That did not save.' });

		notices.items.length = 0;
		enhance.mockClear();
		await submitWith({ type: 'failure' });
		expect(notices.items[0].message).toBe('That did not save.');
	});

	test('a redirect is neither a success to announce nor a failure', async () => {
		await submitWith({ type: 'redirect' }, { notice: 'Saved.' });
		expect(notices.items).toHaveLength(0);
	});
});

describe('where the keyboard lands', () => {
	test('on the first real field inside a dialog', () => {
		document.body.innerHTML = `
			<div id="dialog">
				<input type="hidden" name="id" value="3" />
				<input name="title" />
				<textarea name="notes"></textarea>
			</div>`;

		autofocus(document.querySelector('#dialog')!);
		expect((document.activeElement as HTMLInputElement).name).toBe('title');
	});

	test('on the field itself when the field is what it was put on', () => {
		document.body.innerHTML = '<input name="title" />';
		autofocus(document.querySelector('input')!);
		expect((document.activeElement as HTMLInputElement).name).toBe('title');
	});

	test('nowhere at all, rather than throwing, when there is no field', () => {
		document.body.innerHTML = '<div id="empty"><p>nothing here</p></div>';
		expect(() => autofocus(document.querySelector('#empty')!)).not.toThrow();
	});

	test('and on a lone button when that is the question being asked', () => {
		// The board's delete confirmation wants the keyboard on Delete, so `x`
		// then Enter finishes what `x` started — safe only beside `armed`.
		document.body.innerHTML = '<button id="confirm">Delete</button>';
		focusHere(document.querySelector('#confirm')!);
		expect(document.activeElement?.id).toBe('confirm');
	});
});

describe('fading a section in as it is scrolled to', () => {
	function observed() {
		const instances: { callback: (entries: unknown[]) => void; disconnect: () => void }[] = [];
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				callback: (entries: unknown[]) => void;
				constructor(callback: (entries: unknown[]) => void) {
					this.callback = callback;
					instances.push({ callback, disconnect: () => this.disconnect() });
				}
				observe() {}
				disconnect = vi.fn();
			}
		);
		return instances;
	}

	test('somebody who asked for less motion gets the content immediately', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		document.body.innerHTML = '<section id="s"></section>';

		reveal(document.querySelector('#s')!);
		const section = document.querySelector('#s')!;

		expect(section.classList.contains('revealed')).toBe(true);
		// And it is never staged to fade, so there is nothing to animate.
		expect(section.classList.contains('reveal')).toBe(false);
	});

	test('and so does a browser with no way to tell when it arrives', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		vi.stubGlobal('IntersectionObserver', undefined);
		document.body.innerHTML = '<section id="s"></section>';

		reveal(document.querySelector('#s')!);
		expect(document.querySelector('#s')!.classList.contains('revealed')).toBe(true);
	});

	test('otherwise it is staged, then revealed when it comes into view', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		const instances = observed();
		document.body.innerHTML = '<section id="s"></section>';

		reveal(document.querySelector('#s')!, 120);
		const section = document.querySelector('#s') as HTMLElement;

		expect(section.classList.contains('reveal')).toBe(true);
		expect(section.classList.contains('revealed')).toBe(false);
		expect(section.style.transitionDelay).toBe('120ms');

		instances[0].callback([{ isIntersecting: true }]);
		expect(section.classList.contains('revealed')).toBe(true);
	});

	test('once only, so scrolling back up does not make it flicker', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		const instances = observed();
		document.body.innerHTML = '<section id="s"></section>';

		const handle = reveal(document.querySelector('#s')!) as { destroy?: () => void };
		instances[0].callback([{ isIntersecting: true }]);

		// It stops watching the moment it has done its job.
		expect(typeof handle.destroy).toBe('function');
	});

	test('and a section scrolled past without entering stays staged', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false }));
		const instances = observed();
		document.body.innerHTML = '<section id="s"></section>';

		reveal(document.querySelector('#s')!);
		instances[0].callback([{ isIntersecting: false }]);

		expect(document.querySelector('#s')!.classList.contains('revealed')).toBe(false);
	});
});

describe('a textarea the size of what is in it', () => {
	/** happy-dom does no layout, so the height the content wants is stated. */
	function aTextarea(scrollHeight: number) {
		document.body.innerHTML = '<textarea rows="2"></textarea>';
		const node = document.querySelector('textarea')!;
		Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
		return node;
	}

	test('is as tall as its content from the moment it appears', () => {
		const node = aTextarea(96);
		autogrow(node);
		expect(node.style.height).toBe('96px');
		expect(node.style.overflowY).toBe('hidden');
	});

	test('stops at a ceiling, so one long note cannot push the buttons off screen', () => {
		const node = aTextarea(2000);
		autogrow(node, 480);
		expect(node.style.height).toBe('480px');
		// And past the ceiling it scrolls, rather than hiding what is under it.
		expect(node.style.overflowY).toBe('auto');
	});

	test('remeasures as it is typed into', () => {
		const node = aTextarea(96);
		autogrow(node);

		Object.defineProperty(node, 'scrollHeight', { value: 200, configurable: true });
		node.dispatchEvent(new Event('input'));
		expect(node.style.height).toBe('200px');
	});

	test('and stops measuring once it is gone', () => {
		const node = aTextarea(96);
		const handle = autogrow(node);
		handle.destroy();

		Object.defineProperty(node, 'scrollHeight', { value: 400, configurable: true });
		node.dispatchEvent(new Event('input'));
		expect(node.style.height).toBe('96px');
	});
});
