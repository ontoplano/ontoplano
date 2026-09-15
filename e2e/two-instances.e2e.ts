import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Two instances on one screen, and neither can see the other's rows.
 *
 * A person can now use both: the official instance in a browser, and the one
 * that is the phone itself, with the same app drawing both. The whole promise
 * of the isolated mode is that what is on the device never leaves it — so the
 * failure that would matter most is not a crash, it is a leak: a note written
 * on the phone turning up in the account on the server, or the server's week
 * showing through on a phone that is supposed to be alone.
 *
 * Nothing structural stops it by construction. `$lib/db` is one binding and
 * the services are written against it; which database is behind it is decided
 * by whoever bound it — `$lib/server/db` on the server, the worker that owns
 * the OPFS file on the device. That is exactly the kind of arrangement that
 * works until somebody imports the wrong module, and this is the test that
 * notices.
 *
 * Driven through `?isolated`, which is how the suite runs both modes against
 * one server: with it the page answers itself out of the device's database,
 * and without it the request goes to the server as usual. A full page load
 * either way, because the switch is read when the page boots.
 */
test.describe.configure({ mode: 'serial' });

const ON_THE_SERVER = 'written on the server';
const ON_THE_DEVICE = 'written on the device';

async function addTodo(page: import('@playwright/test').Page, title: string) {
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Onto the device, and then around it.
 *
 * `?isolated` is read when the page boots, so the first load is still the
 * server's — it renders the page before any of this exists. Every move after
 * that is the client router's, and those are the requests the bridge answers
 * out of the device's database. Which is also how the real isolated build
 * works: there is no server behind it to render anything, so every screen
 * after the first is fetched by the page itself.
 *
 * The link is made rather than found so this does not depend on what happens
 * to be on screen: SvelteKit intercepts a same-origin click wherever it comes
 * from.
 */
async function onDevice(page: import('@playwright/test').Page) {
	await visit(page, '/?isolated');
	return async (path: string) => {
		await page.evaluate((href) => {
			document.querySelector('#e2e-go')?.remove();
			const link = document.createElement('a');
			link.id = 'e2e-go';
			link.href = href;
			link.textContent = 'go';
			link.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
			document.body.append(link);
		}, path);
		await page.click('#e2e-go');
		await page.waitForURL(`**${path}`, { timeout: 60_000 });
		// And taken away again: it is a lever, not part of the page, and one
		// left lying on top of the screen catches the next click.
		await page.evaluate(() => document.querySelector('#e2e-go')?.remove());
	};
}

test('what is written on the device stays there, and the server never shows through', async ({
	page
}) => {
	test.setTimeout(180_000);
	await register(page, `two-${Date.now()}@test.invalid`);

	// One on the server, the ordinary way.
	await visit(page, '/tasks/todo');
	await addTodo(page, ON_THE_SERVER);

	// The same screen, answered by the device.
	const go = await onDevice(page);
	await go('/tasks/todo');
	await expect(page.getByRole('button', { name: 'New to-do' })).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(ON_THE_SERVER)).toHaveCount(0);

	await addTodo(page, ON_THE_DEVICE);
	await expect(page.getByText(ON_THE_DEVICE).first()).toBeVisible();
	// And still nothing of the server's, now that the device has written.
	await expect(page.getByText(ON_THE_SERVER)).toHaveCount(0);

	// Back to the server: it has its own and has never heard of the other.
	await visit(page, '/tasks/todo');
	await expect(page.getByText(ON_THE_SERVER).first()).toBeVisible();
	await expect(page.getByText(ON_THE_DEVICE)).toHaveCount(0);

	// And the device still has its own after the round trip, which is the
	// other half: neither one overwrote the other either.
	await (
		await onDevice(page)
	)('/tasks/todo');
	await expect(page.getByText(ON_THE_DEVICE).first()).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(ON_THE_SERVER)).toHaveCount(0);
});

/**
 * The worst case, deliberately: the destructive one.
 *
 * Deleting the instance on a device walks every table holding user data and
 * then throws the file away. It is the same walk the server runs when an
 * account is deleted — one piece of code, `$lib/services/account-data.ts` —
 * which is what makes running it against the wrong database a real
 * possibility rather than a theoretical one.
 */
test('deleting the instance on the device leaves the server account untouched', async ({
	page
}) => {
	test.setTimeout(180_000);
	await register(page, `two-del-${Date.now()}@test.invalid`);

	await visit(page, '/tasks/todo');
	await addTodo(page, ON_THE_SERVER);

	const go = await onDevice(page);
	await go('/tasks/todo');
	await expect(page.getByRole('button', { name: 'New to-do' })).toBeVisible({ timeout: 60_000 });
	await addTodo(page, ON_THE_DEVICE);

	// The account page the device has: no address, no password, one way out.
	await go('/settings/account');
	const end = page.getByRole('button', { name: 'Delete instance' });
	await expect(end).toBeVisible({ timeout: 60_000 });
	// And none of the server's cards, which are about a server.
	await expect(page.getByRole('button', { name: 'Delete everything' })).toHaveCount(0);
	await expect(page.getByText('Email address')).toHaveCount(0);

	await end.click();
	await page.locator('[name="confirm"]').fill('ERASE ONTOPLANO');
	await page.getByRole('button', { name: 'Delete permanently' }).click();

	// It leaves for the screen that chooses where your ontoplano lives.
	await page.waitForURL('**/instance', { timeout: 60_000 });

	// The server's account is exactly as it was.
	await visit(page, '/tasks/todo');
	await expect(page.getByText(ON_THE_SERVER).first()).toBeVisible();
	await expect(page.getByText(ON_THE_DEVICE)).toHaveCount(0);
});

/**
 * And the tab that says which instance you are looking at.
 *
 * A device reports the build it is running and the file its data is in, and
 * nothing about a deployment — there is none. Worth asserting because the
 * screen is shared: the failure mode is a card about somebody's server
 * appearing on a phone with blanks in it.
 */
test('the instance tab on a device is the build and the storage, and nothing else', async ({
	page
}) => {
	test.setTimeout(120_000);
	await register(page, `two-inst-${Date.now()}@test.invalid`);

	await (
		await onDevice(page)
	)('/settings/instance');
	await expect(page.getByTestId('app-version')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText('Where the data is')).toBeVisible();

	// A deployment's questions, absent rather than blank.
	await expect(page.getByText('Who can register')).toHaveCount(0);
	await expect(page.getByText('Deployment')).toHaveCount(0);
	await expect(page.getByText('Invitations')).toHaveCount(0);
	await expect(page.getByText('Running since')).toHaveCount(0);
});

/**
 * Out of one instance and into the other, which is the point of a file.
 *
 * A person using both can move what is on the phone onto a server, or the
 * other way round, and the only thing that carries it is the export. So this
 * takes one from the server account and restores it onto the device — the
 * whole path, through the page, including the copy the device keeps first —
 * and then checks that the server still has exactly what it had.
 *
 * Worth its runtime because the restore empties before it fills: if the wrong
 * database were bound, this is the test where a server account disappears.
 */
test('an export moves from the server onto the device, and the server keeps its own', async ({
	page
}) => {
	test.setTimeout(240_000);
	await register(page, `two-move-${Date.now()}@test.invalid`);

	await visit(page, '/tasks/todo');
	await addTodo(page, ON_THE_SERVER);

	// The file, as the page would hand it over.
	const file = await page.evaluate(async () => {
		const res = await fetch('/settings/account/export?pictures=no');
		return res.text();
	});
	expect(file).toContain(ON_THE_SERVER);

	const go = await onDevice(page);
	await go('/tasks/todo');
	await expect(page.getByRole('button', { name: 'New to-do' })).toBeVisible({ timeout: 60_000 });
	await addTodo(page, ON_THE_DEVICE);

	await go('/settings/account/import');
	const restore = page.locator('form[action="?/importAccount"]');
	await expect(restore).toBeVisible({ timeout: 60_000 });
	await restore.locator('textarea[name="text"]').fill(file);
	await restore.locator('[name="confirm"]').fill('REPLACE');

	// The copy the device keeps before replacing is a download, so it has to
	// actually arrive — the page cancels the restore if it does not.
	const kept = page.waitForEvent('download', { timeout: 60_000 });
	await restore.getByRole('button', { name: /restore/i }).click();
	expect((await kept).suggestedFilename()).toContain('before-import');

	// And wait for it to have happened: the restore is one transaction over
	// every table, and clicking away mid-way asks the worker for a page while
	// it is still inside that transaction.
	await expect(page.getByText(/Imported \d+ rows/).first()).toBeVisible({ timeout: 120_000 });

	// The device now holds the server's week and not its own.
	await go('/tasks/todo');
	await expect(page.getByText(ON_THE_SERVER).first()).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(ON_THE_DEVICE)).toHaveCount(0);

	// And the server is exactly where it was: one to-do, its own.
	await visit(page, '/tasks/todo');
	await expect(page.getByText(ON_THE_SERVER).first()).toBeVisible();
	await expect(page.getByText(ON_THE_DEVICE)).toHaveCount(0);
});
