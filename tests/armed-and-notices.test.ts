/**
 * @vitest-environment happy-dom
 *
 * The guard on a destructive button, and the messages that report what
 * happened.
 *
 * `armed` exists because a two-step delete puts "Confirm?" exactly where
 * "Delete" was, so a double-click — one to arm, one that lands before the eye
 * catches up — destroyed the row. It is the difference between a confirmation
 * and a formality, and it had no test at all.
 *
 * The notices are the other half of the same conversation: what the app says
 * back. A confirmation is a receipt and leaves on its own; a failure is
 * unfinished business and waits, because a message about something that did
 * NOT happen must not vanish while it is being read.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { armed } from '../src/lib/actions/armed';
import { dismiss, notices, notify } from '../src/lib/notify.svelte';

afterEach(() => {
	document.body.innerHTML = '';
	notices.items.length = 0;
	vi.useRealTimers();
});

function aButton(): HTMLButtonElement {
	document.body.innerHTML = '<button>Delete</button>';
	return document.querySelector('button')!;
}

describe('a button that has just appeared', () => {
	test('says it is not ready, in the markup and to a screen reader', () => {
		const button = aButton();
		armed(button);

		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.classList.contains('is-unarmed')).toBe(true);
	});

	test('swallows the click that arrived too soon', () => {
		const button = aButton();
		const pressed = vi.fn();
		button.addEventListener('click', pressed);
		armed(button);

		button.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
		expect(pressed).not.toHaveBeenCalled();
	});

	test('and takes it once it has been on screen long enough to read', () => {
		vi.useFakeTimers();
		const button = aButton();
		const pressed = vi.fn();
		button.addEventListener('click', pressed);
		armed(button);

		vi.advanceTimersByTime(500);
		button.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

		expect(pressed).toHaveBeenCalledTimes(1);
		expect(button.hasAttribute('aria-disabled')).toBe(false);
	});

	test('never swallows Escape', () => {
		// Backing out is not the accident this guards against. Swallowing it
		// left a confirmation stuck open for exactly the moments somebody is
		// most likely to want out of it.
		const button = aButton();
		const escaped = vi.fn();
		button.addEventListener('keydown', escaped);
		armed(button);

		button.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		expect(escaped).toHaveBeenCalledTimes(1);
	});

	test('does swallow the Enter that arrived with the keystroke that armed it', () => {
		const button = aButton();
		const confirmed = vi.fn();
		button.addEventListener('keydown', confirmed);
		armed(button);

		button.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		expect(confirmed).not.toHaveBeenCalled();
	});

	test('stops guarding once it is gone', () => {
		vi.useFakeTimers();
		const button = aButton();
		const handle = armed(button);
		handle.destroy();

		const pressed = vi.fn();
		button.addEventListener('click', pressed);
		button.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
		expect(pressed).toHaveBeenCalledTimes(1);
	});
});

describe('what the app says back', () => {
	test('a confirmation is a receipt with a time on it', () => {
		notify.success('Sections saved.');
		const [notice] = notices.items;
		expect(notice.kind).toBe('success');
		expect(notice.until).toBeGreaterThan(Date.now());
	});

	test('a failure waits to be dismissed', () => {
		// It must not vanish while it is being read: something did not happen.
		notify.error('That did not save.');
		expect(notices.items[0].until).toBeNull();
	});

	test('the same thing said twice in a row is one thing', () => {
		notify.success('Saved.');
		notify.success('Saved.');
		expect(notices.items).toHaveLength(1);
	});

	test('but two different things are two', () => {
		notify.success('Saved.');
		notify.error('Not saved.');
		expect(notices.items).toHaveLength(2);
	});

	test('nothing is said about nothing', () => {
		notify.success('   ');
		expect(notices.items).toHaveLength(0);
	});

	test('a stack of them does not grow without end', () => {
		for (let i = 0; i < 10; i++) notify.error(`problem ${i}`);
		expect(notices.items.length).toBeLessThanOrEqual(4);
		// And it is the newest that survive, not the first four seen.
		expect(notices.items.at(-1)!.message).toBe('problem 9');
	});

	test('and any of them can be dismissed by hand', () => {
		const id = notify.error('Go away');
		dismiss(id);
		expect(notices.items).toHaveLength(0);
	});
});
