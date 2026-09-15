/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTopOverlay } from '../src/lib/phone-back';

/**
 * The back gesture, with something open over the page.
 *
 * A form on a phone is a dialog drawn as a screen, and it is not history — so
 * a gesture that only asked "is there anywhere behind me" walked out of the
 * app while a half-written to-do was on screen. What is on top goes first.
 */
describe('what the back gesture closes first', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('closes an open dialog and says it did', () => {
		document.body.innerHTML = '<dialog open id="form"></dialog>';
		const dialog = document.querySelector('dialog') as HTMLDialogElement;
		// jsdom's `<dialog>` has no `close()` in every version; the attribute is
		// what `[open]` matches on, so this stands in for the platform's.
		dialog.close = vi.fn(() => dialog.removeAttribute('open'));

		expect(closeTopOverlay()).toBe(true);
		expect(dialog.close).toHaveBeenCalled();
	});

	it('leaves a closed dialog alone', () => {
		document.body.innerHTML = '<dialog id="form"></dialog>';
		expect(closeTopOverlay()).toBe(false);
	});

	/*
	 * The wheels are not dialogs — they are a layer over the page — but they
	 * already answer Escape, so the gesture says Escape rather than growing a
	 * second way to close them.
	 */
	it('says Escape to a wheel, which is what closes one', () => {
		document.body.innerHTML = '<div class="pie-layer"></div>';
		const heard: string[] = [];
		window.addEventListener('keydown', (e) => heard.push(e.key));

		expect(closeTopOverlay()).toBe(true);
		expect(heard).toContain('Escape');
	});

	it('says so when the page is bare, so the gesture can mean the page behind', () => {
		document.body.innerHTML = '<main>a room</main>';
		expect(closeTopOverlay()).toBe(false);
	});
});
