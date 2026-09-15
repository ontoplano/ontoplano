import { expect, test } from '@playwright/test';
import { PASSWORD, register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The two irreversible buttons, and everything that must not be able to press
 * them.
 *
 * Emptying an account is the more dangerous of the two in one specific way:
 * deleting yours ends with you signed out and knowing about it, while emptying
 * one leaves an account that looks fine and is empty. So what is tested here is
 * mostly the refusals — no password, a wrong password, the wrong word typed,
 * somebody else's session, no session at all — and then, once, that it does
 * what it says and touches nothing but the account that asked.
 */
const EMPTY = 'DELETE EVERYTHING';

/**
 * Make a card, so there is something to still be there — or not — later.
 *
 * The same walk `board.e2e.ts` uses: the To-do tab, `n`, the card form. A card
 * with no day is a `todo_tasks` row, which is one of the tables emptying is
 * supposed to take.
 */
async function leaveSomething(page: import('@playwright/test').Page, title: string) {
	await visit(page, '/tasks/board');
	await page.getByRole('button', { name: 'To-do', exact: true }).click();
	await page.keyboard.press('n');
	await page.fill('#card-form [name=heading]', title);
	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
}

test('the danger zone empties this account and nothing else', async ({ page, browser }) => {
	test.setTimeout(180_000);

	// Somebody else, with their own thing in it, signed in the whole time.
	const other = await browser.newContext();
	const theirs = await other.newPage();
	const theirEmail = testEmail('danger-other');
	await register(theirs, theirEmail);
	await leaveSomething(theirs, 'Their untouched todo');

	const mine = testEmail('danger-mine');
	await register(page, mine);
	await leaveSomething(page, 'My todo');

	await visit(page, '/settings/account');
	const zone = page.locator('.danger-zone');
	await expect(zone).toBeVisible();
	await expect(zone.getByRole('heading', { name: 'Danger zone' })).toBeVisible();

	// The wrong word is refused, with the password right.
	await zone.getByRole('button', { name: 'Delete everything' }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel(`Type “${EMPTY}” to confirm`).fill('delete');
	await sheet.getByLabel('Your password').fill(PASSWORD);
	await sheet.getByRole('button', { name: 'Delete everything' }).click();
	await expect(sheet.getByText(/Type DELETE EVERYTHING exactly/)).toBeVisible();

	// The wrong password is refused, with the word right.
	await sheet.getByLabel(`Type “${EMPTY}” to confirm`).fill(EMPTY);
	await sheet.getByLabel('Your password').fill('not-the-password');
	await sheet.getByRole('button', { name: 'Delete everything' }).click();
	await expect(sheet.getByText(/not your password/)).toBeVisible();

	// Nothing has gone yet.
	await visit(page, '/tasks/board');
	await page.getByRole('button', { name: 'To-do', exact: true }).click();
	await expect(page.getByText('My todo', { exact: true }).first()).toBeVisible();

	// Both right: it goes.
	await visit(page, '/settings/account');
	await page.locator('.danger-zone').getByRole('button', { name: 'Delete everything' }).click();
	const go = page.getByRole('dialog');
	await go.getByLabel(`Type “${EMPTY}” to confirm`).fill(EMPTY);
	await go.getByLabel('Your password').fill(PASSWORD);
	await go.getByRole('button', { name: 'Delete everything' }).click();
	await expect(page.getByText(/has been deleted/).first()).toBeVisible();

	// The account is still mine and still signed in...
	await visit(page, '/settings/account');
	await expect(page.getByText(mine)).toBeVisible();
	// ...and empty.
	await visit(page, '/tasks/board');
	await page.getByRole('button', { name: 'To-do', exact: true }).click();
	await expect(page.getByText('My todo', { exact: true })).toHaveCount(0);

	// And the other account never noticed.
	await visit(theirs, '/tasks/board');
	await theirs.getByRole('button', { name: 'To-do', exact: true }).click();
	await expect(theirs.getByText('Their untouched todo', { exact: true }).first()).toBeVisible();
	await other.close();
});

test('a signed-out post, and one from another account, empty nothing', async ({
	page,
	browser
}) => {
	test.setTimeout(180_000);

	const victim = testEmail('danger-victim');
	await register(page, victim);
	await leaveSomething(page, 'Still here afterwards');
	const origin = new URL(page.url()).origin;

	// Signed out: the action is behind the login like every other page action.
	const anonymous = await browser.newContext();
	const out = await anonymous.request.post(`${origin}/settings/account?/empty`, {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { confirm: EMPTY, password: PASSWORD }
	});
	/*
	 * The status is 200 and that is fine: an enhanced form action always gets
	 * one, and what it carries is the answer. What matters is that the answer
	 * is "go and sign in" rather than "done" — the action never ran.
	 */
	const envelope = JSON.parse(await out.text());
	expect(envelope.type, `a signed-out post got ${JSON.stringify(envelope)}`).toBe('redirect');
	expect(envelope.location).toContain('/login');

	/*
	 * And from another account, carrying the victim's address.
	 *
	 * The address is the only handle an attacker has — the action takes no id,
	 * it empties whoever the session says is asking. Sending somebody else's
	 * along is the obvious thing to try, and what it must do is nothing to
	 * them.
	 */
	const attacker = await browser.newContext();
	const theirs = await attacker.newPage();
	await register(theirs, testEmail('danger-attacker'));
	const reply = await theirs.request.post(`${origin}/settings/account?/empty`, {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { confirm: EMPTY, password: PASSWORD, email: victim, userId: victim }
	});
	// It may well succeed — at emptying the attacker's own empty account.
	expect(reply.status()).toBeLessThan(500);

	await visit(page, '/tasks/board');
	await page.getByRole('button', { name: 'To-do', exact: true }).click();
	await expect(page.getByText('Still here afterwards', { exact: true }).first()).toBeVisible();

	await anonymous.close();
	await attacker.close();
});
