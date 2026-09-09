import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The board's keyboard, where it destroys things.
 *
 * `x` was registered as "Ask to delete card", set a `confirmingDelete` flag,
 * and no markup read that flag any more — so the one keyboard path to deleting
 * a card silently did nothing, and the shortcut sheet advertised it anyway.
 * Found by a sweep of the shortcut registry rather than by anybody pressing it.
 *
 * These tests hold both halves of the rule at once: `x` has to visibly ask, and
 * `x` on its own must never delete. A keystroke that destroys a row is a
 * keystroke somebody makes by accident.
 */

async function newCard(page: import('@playwright/test').Page, title: string) {
	await visit(page, '/tasks/board');
	await page.keyboard.press('n');
	// Wait for the form the keystroke opens rather than typing into where it is
	// about to be: under a loaded parallel run it has not mounted yet, and
	// `fill` on a locator that does not exist waits out the whole test.
	const heading = page.locator('#card-form [name=heading]');
	await expect(heading).toBeVisible({ timeout: 15_000 });
	await heading.fill(title);
	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
}

/** Put the board's keyboard focus on the card with this title. */
async function focusCard(page: import('@playwright/test').Page, title: string) {
	await page.getByText(title, { exact: true }).click();
}

test.describe('the board deletes by keyboard', () => {
	test('x asks, and does not delete on its own', async ({ page }) => {
		await register(page, `board-x-${Date.now()}@example.test`);
		const title = 'A card to be asked about';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');

		// The question is on the card, not in a dialog over the pointer.
		await expect(page.getByText('Delete this?')).toBeVisible();
		// And the card is still there — asking is not doing.
		await expect(page.getByText(title, { exact: true })).toBeVisible();

		// A reload proves nothing was written, not merely that nothing redrew.
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	});

	test('Escape backs out of the question', async ({ page }) => {
		await register(page, `board-esc-${Date.now()}@example.test`);
		const title = 'A card that survives';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');
		await expect(page.getByText('Delete this?')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByText('Delete this?')).toHaveCount(0);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	});

	test('answering the question deletes the card', async ({ page }) => {
		await register(page, `board-del-${Date.now()}@example.test`);
		const title = 'A card that goes';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');
		const confirm = page.getByRole('button', { name: 'Delete', exact: true });
		await expect(confirm).toBeVisible();

		// The button ignores its own first moments on purpose, so that the press
		// that opened the question cannot answer it. Wait it out rather than
		// racing it — a click that is swallowed is the guard working.
		await page.waitForTimeout(600);
		await confirm.click();

		await expect(page.getByText(title, { exact: true })).toHaveCount(0);
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(page.getByText(title, { exact: true })).toHaveCount(0);
	});
});

/**
 * The todo rail beside Today, which is a todo list and has to behave like one.
 *
 * The General tab sorts every undated todo into its status column, so a
 * finished one lands under Done and reads correctly. The rail is a single list
 * with no column to put it in, and it was rendering the same unfiltered set —
 * so everything ever ticked off stayed in it, and the list only ever grew.
 */
test.describe('the todo rail', () => {
	test('drops a todo once it is done', async ({ page }) => {
		await register(page, `board-rail-${Date.now()}@example.test`);
		const title = 'A rail todo that gets finished';
		const rail = page.getByRole('complementary', { name: 'To-do list' });
		const todoTab = page.getByRole('button', { name: 'To-do', exact: true });
		const todayTab = page.getByRole('button', { name: 'Today', exact: true });

		// A card made on the Todo tab has no day, which is what puts it in the
		// rail; one made on Today would be a block on today's board instead.
		await visit(page, '/tasks/board');
		await todoTab.click();
		await page.keyboard.press('n');
		await page.fill('#card-form [name=heading]', title);
		await page.getByRole('button', { name: 'Add card' }).click();
		await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

		// The rail is drawn beside Today, so that is where it has to show up.
		await todayTab.click();
		await expect(rail.getByText(title, { exact: true })).toBeVisible();

		await todoTab.click();
		await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
		// Let the undo window run out, so the write actually happens.
		await expect(page.getByText(`Completed ${title}`)).toBeVisible();
		await expect(page.getByText(`Completed ${title}`)).toHaveCount(0, { timeout: 15_000 });

		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(rail.getByText(title, { exact: true })).toHaveCount(0);
	});
});

/**
 * Ticking a card off, and the few seconds to have meant something else.
 *
 * The write happens at once and Undo writes the opposite — holding it made the
 * card say done while everything counted from it still said otherwise. So the
 * reload at the end is the real assertion in both directions: it proves what
 * the server ended up believing, not merely what the page last drew.
 */
test.describe('undo on a card ticked off', () => {
	test('offers Undo, and Undo means the write never happens', async ({ page }) => {
		await register(page, `board-undo-${Date.now()}@example.test`);
		const title = 'A card ticked off by mistake';
		await newCard(page, title);

		await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
		await expect(page.getByText(`Completed ${title}`)).toBeVisible();

		await page.getByRole('button', { name: 'Undo' }).click();
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');

		// Back where it started: still tickable, so still not done.
		await expect(
			page.getByRole('button', { name: `Mark ${title} done`, exact: true })
		).toBeVisible();
	});

	test('lets the window run out and the card is done', async ({ page }) => {
		await register(page, `board-done-${Date.now()}@example.test`);
		const title = 'A card that really is done';
		await newCard(page, title);

		await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
		await expect(page.getByText(`Completed ${title}`)).toBeVisible();

		// The window is five seconds by default; wait it out rather than racing it.
		await expect(page.getByText(`Completed ${title}`)).toHaveCount(0, { timeout: 15_000 });
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');

		await expect(
			page.getByRole('button', { name: `Mark ${title} not done`, exact: true })
		).toBeVisible();
	});
});

/**
 * The board on a phone.
 *
 * It was a sideways snapping strip of columns, all as tall as the tallest, so
 * getting from Pending to Done meant scrolling past a full-height Doing. Three
 * columns are not enough to be worth navigating — they are enough to be named,
 * so the phone shows one at a time and a switcher above it.
 */
test.describe('the board on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('shows one column at a time, chosen by name', async ({ page }) => {
		await register(page, `board-phone-${Date.now()}@example.test`);
		const title = 'A card to find under Done';
		await newCard(page, title);

		// Pending is what a phone opens on, and the card is on the screen.
		await expect(page.getByRole('button', { name: /^Pending/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByText(title, { exact: true })).toBeVisible();

		await page.getByRole('button', { name: /^Done/ }).click();
		await expect(page.getByRole('button', { name: /^Done/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// One column on screen at a time: Pending's card is no longer on it, and
		// nothing had to be scrolled past to get here.
		await expect(page.getByText(title, { exact: true })).toBeHidden();
	});
});

/**
 * Where a card goes when the column it should go to is not on the screen.
 *
 * On a phone the board shows one column, so there is nothing to drag a card
 * *to*. The names above it are the target: they light up while a card is being
 * dragged, and dropping on one moves the card and follows it — a card that
 * moved somewhere invisible has, as far as the screen is concerned, vanished.
 */
test.describe('dropping on the column switcher', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('moves the card there and follows it', async ({ page }) => {
		await register(page, `board-switch-${Date.now()}@example.test`);
		const title = 'A card that should end up Doing';
		await newCard(page, title);

		const doing = page.getByRole('button', { name: /^Doing/ });
		const card = page.getByText(title, { exact: true });

		// A real HTML5 drag, which is what the desktop and a mouse-driven narrow
		// window do. The touch path is the tick box and the card editor.
		await card.dispatchEvent('dragstart', { dataTransfer: await makeDataTransfer(page) });
		await doing.dispatchEvent('dragover', { dataTransfer: await makeDataTransfer(page) });
		await doing.dispatchEvent('drop', { dataTransfer: await makeDataTransfer(page) });
		await page.waitForTimeout(900);

		// It followed the card: Doing is the column on screen now, with the card
		// in it.
		await expect(doing).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByText(title, { exact: true })).toBeVisible();

		// And it really moved, rather than only appearing to.
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await page.getByRole('button', { name: /^Doing/ }).click();
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	});
});

/** A DataTransfer the page owns, which a synthetic drag event needs. */
function makeDataTransfer(page: import('@playwright/test').Page) {
	return page.evaluateHandle(() => new DataTransfer());
}

/**
 * The keyboard drives the board.
 *
 * Pinned after a report that the shortcuts were dead: they were not, on this
 * build — but nothing was holding them, so nothing would have said so if they
 * were. `n` is the one that needs no cards to exist, and `g` the one that
 * needs no form to open.
 */
test('n opens a new card and g switches the tab, from the keyboard', async ({ page }) => {
	await register(page, `board-keys-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/board');

	await page.keyboard.press('g');
	await expect(page.getByRole('button', { name: 'To-do', exact: true })).toHaveClass(
		/font-semibold/
	);

	await page.keyboard.press('n');
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
});
