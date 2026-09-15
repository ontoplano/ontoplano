import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The corner where help lives, and the button for when none of it helped.
 *
 * A wide screen's corner only. On a phone the row was four squares across the
 * bottom right of every screen, over whatever was under it — it is the fan
 * under the bar's account button now, and `fan.e2e.ts` is that.
 */
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('there is no dock at all — the bar fans it out instead', async ({ page }) => {
		await register(page, testEmail('dock'));
		await visit(page, '/');

		await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeHidden();
		await expect(page.getByRole('link', { name: 'The documentation' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Account and help' })).toBeVisible();
	});
});

test('on a wide screen the row is simply there, with no fold to press', async ({ page }) => {
	await register(page, testEmail('dock-wide'));
	await visit(page, '/');

	await expect(page.getByRole('link', { name: 'The documentation' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeHidden();
});

/**
 * A bug, reported by somebody who hit one.
 *
 * It reaches the admin page, which is the only reason to have the button:
 * a report nobody reads is a form that wastes the reporter's time.
 */
test('a reported problem reaches the admin page', async ({ page }) => {
	const mark = `the plan draws nothing ${Date.now()}`;
	await register(page, testEmail('dock-report'));
	await visit(page, '/tasks/plan');

	await page.getByRole('button', { name: 'Report a problem, or suggest something' }).click();
	const dialog = page.getByRole('dialog', { name: 'Tell the operator' });
	// A problem, not an idea: the dialog opens on this one, and the admin page
	// below tells the two apart.
	await expect(dialog.getByRole('button', { name: 'Something is wrong' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await dialog.locator('textarea').fill(mark);
	await dialog.getByRole('button', { name: 'Send' }).click();
	await expect(dialog).toContainText('Thank you');

	// The report carries where it came from, which is the first thing anybody
	// reading them wants to know.
	const seen = await page.evaluate(async () => {
		const res = await fetch('/api/report', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'a second one', url: '/tasks/plan' })
		});
		return res.status;
	});
	expect(seen).toBe(200);
});
