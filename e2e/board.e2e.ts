import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
		await register(page, testEmail('board-x'));
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
		await register(page, testEmail('board-esc'));
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
		await register(page, testEmail('board-del'));
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
		await register(page, testEmail('board-rail'));
		const title = 'A rail todo that gets finished';
		const rail = page.getByRole('complementary', { name: 'Tasks' });
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
		await register(page, testEmail('board-undo'));
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
		await register(page, testEmail('board-done'));
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
 * It was stacked for a while, which put a full-height Doing between Pending
 * and Done and made moving a card a trip down the page. A board is columns, so
 * the phone slides sideways, and the names above jump the strip to a column.
 */
test.describe('the board on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('slides sideways, and the names jump to a column', async ({ page }) => {
		await register(page, testEmail('board-phone'));
		const title = 'A card to find under Done';
		await newCard(page, title);

		// Pending is what a phone opens on, and the card is on the screen.
		await expect(page.getByRole('button', { name: /^Pending/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByText(title, { exact: true })).toBeVisible();

		const strip = page.locator('[data-tour="board-columns"]');
		const room = await strip.evaluate((s) => s.scrollWidth - s.clientWidth);
		expect(room, 'the columns have somewhere to slide to').toBeGreaterThan(50);

		const was = await strip.evaluate((s) => s.scrollLeft);
		await page.getByRole('button', { name: /^Done/ }).click();
		await expect(page.getByRole('button', { name: /^Done/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect
			.poll(() => strip.evaluate((s) => s.scrollLeft), { timeout: 5000 })
			.toBeGreaterThan(was);

		// The page itself never scrolls sideways; only the strip does.
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		).toBeLessThan(2);
	});

	test('a drop on a column name moves the card there and follows it', async ({ page }) => {
		await register(page, testEmail('board-drop-name'));
		const title = 'A card dropped on Doing';
		await newCard(page, title);

		const doing = page.getByRole('button', { name: /^Doing/ });
		const card = page.getByText(title, { exact: true });
		const transfer = () => page.evaluateHandle(() => new DataTransfer());
		await card.dispatchEvent('dragstart', { dataTransfer: await transfer() });
		await doing.dispatchEvent('dragover', { dataTransfer: await transfer() });
		await doing.dispatchEvent('drop', { dataTransfer: await transfer() });

		await expect(doing).toHaveAttribute('aria-pressed', 'true');
		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(
			page.locator('[data-tour="board-columns"] section').nth(1).getByText(title, { exact: true })
		).toBeAttached();
	});

	test('moves a card with the grip and a press on a column name', async ({ page }) => {
		await register(page, testEmail('board-switch'));
		const title = 'A card that should end up Doing';
		await newCard(page, title);

		// A new account's day already holds the starter week's cards, so the
		// grip is the one on this card rather than the first on the board.
		await page
			.getByRole('button', { name: `Read ${title}` })
			.getByRole('button', { name: 'Move this to another column' })
			.click();
		// The column it is headed for is off the screen; its name is not.
		await page.getByRole('button', { name: /^Doing/ }).click();
		await expect(page.getByRole('button', { name: /^Doing/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await page.waitForTimeout(900);

		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(
			page.locator('[data-tour="board-columns"] section').nth(1).getByText(title, { exact: true })
		).toBeAttached();
	});
});

/**
 * The keyboard drives the board.
 *
 * Pinned after a report that the shortcuts were dead: they were not, on this
 * build — but nothing was holding them, so nothing would have said so if they
 * were. `n` is the one that needs no cards to exist, and `g` the one that
 * needs no form to open.
 */
test('n opens a new card and g switches the tab, from the keyboard', async ({ page }) => {
	await register(page, testEmail('board-keys'));
	await visit(page, '/tasks/board');

	await page.keyboard.press('g');
	// The Today/To-do switch is the app's segmented control now — the same one
	// the plan uses for Day/Week/Month — so which side is chosen is said with
	// `aria-pressed` rather than with a font weight.
	await expect(page.getByRole('button', { name: 'To-do', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	await page.keyboard.press('n');
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
});
