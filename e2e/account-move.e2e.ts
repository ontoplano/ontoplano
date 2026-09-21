import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register, testEmail } from './helpers/account';
import { png } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * Out of one account and into another, and what is missing on purpose.
 *
 * The export is the only thing that moves an account — to somebody's own
 * server, off it, or onto the phone — so the question this answers is not
 * "does the button work" but "is what arrives the same account". It takes one
 * with a picture in it, restores it into a second account through the page a
 * person actually uses, exports that one, and compares the two table by table.
 *
 * The comparison is the point. A restore that quietly drops a table would pass
 * any test that only looked at the screen afterwards, and the tables it drops
 * *on purpose* are a short, deliberate list — billing, tokens, feeds, the audit
 * log: things that belong to the instance that issued them rather than to the
 * person. So the diff has to come out as exactly that list and nothing else.
 */

type Export = {
	exportedAt: string;
	account: { id: string; name: string; email: string };
	data: Record<string, Record<string, unknown>[]>;
};

/**
 * The tables a restore is meant to leave behind, and why.
 *
 * `NOT_PORTABLE` in `$lib/services/account-import` is the list this mirrors —
 * named here rather than imported so that dropping a table from that list
 * quietly is a failing test rather than a test that agrees with whatever the
 * code now says.
 */
const LEFT_BEHIND = [
	'subscriptions',
	'billingCheckouts',
	'apiTokens',
	'pluginManifests',
	'calendarFeeds',
	'webhookSubscriptions',
	'auditEvents',
	'pushSubscriptions'
];

/** What each table holds, ignoring which account it belongs to. */
function rowsOf(dump: Export): Map<string, number> {
	const counts = new Map<string, number>();
	for (const [table, rows] of Object.entries(dump.data)) counts.set(table, rows.length);
	return counts;
}

test('an export restores into another account, and only the unportable is missing', async ({
	page
}) => {
	test.setTimeout(180_000);

	// An account with something of everything in it: writing, a list, and a
	// picture — the last because pictures are the part of an export that is
	// bytes rather than rows, and the part that makes one big.
	await register(page, testEmail('move-from'));

	await visit(page, '/tasks/todo');
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('water the tomatoes');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('water the tomatoes').first()).toBeVisible({ timeout: 30_000 });

	await visit(page, '/media/gallery');
	await page.getByRole('button', { name: 'New album' }).click();
	await page.locator('[name="heading"]').fill('Garden');
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await page.getByRole('link', { name: /Garden/ }).click();
	await page.waitForURL(/\/media\/gallery\/\d+/);
	await expect(page.getByText('Add pictures', { exact: true })).toBeVisible();
	await page.locator('input[name="file"]:not([webkitdirectory])').setInputFiles(png([12, 90, 40]));
	await expect(page.locator('li img')).toHaveCount(1, { timeout: 15_000 });

	// The file itself, exactly as the export screen hands it over.
	const taken = (await page.evaluate(async () => {
		const res = await fetch('/settings/account/export');
		return res.text();
	})) as string;
	const before = JSON.parse(taken) as Export;
	expect(Object.keys(before.data).length).toBeGreaterThan(5);
	expect(before.data.media?.length ?? 0).toBe(1);

	const file = join(mkdtempSync(join(tmpdir(), 'ontoplano-move-')), 'export.json');
	writeFileSync(file, taken);

	// And into a second account, through the page rather than past it: choosing
	// the file is the whole gesture, and the word has to be typed.
	//
	// Signed out first by dropping the cookie: `register` goes to /login, and a
	// signed-in browser is sent straight back out of it.
	await page.context().clearCookies();
	await register(page, testEmail('move-into'));
	await visit(page, '/settings/account/import');
	const restore = page.locator('form[action="?/importAccount"]');
	await expect(restore).toBeVisible();
	await restore.locator('input[type="file"]').setInputFiles(file);

	// Choosing it runs the preview, which is how the page says it understood
	// the file. Nothing is typed until that is on screen.
	await expect(page.getByText(/rows will land/)).toBeVisible({ timeout: 30_000 });

	await restore.locator('[name="confirm"]').fill('REPLACE');
	await restore.getByRole('button', { name: /restore/i }).click();
	await expect(page.getByText(/Imported \d+ rows/).first()).toBeVisible({ timeout: 60_000 });

	// What arrived, read the same way it was written.
	const landed = JSON.parse(
		(await page.evaluate(async () => {
			const res = await fetch('/settings/account/export');
			return res.text();
		})) as string
	) as Export;

	const was = rowsOf(before);
	const now = rowsOf(landed);

	/*
	 * Table by table, and the difference has to be the list above.
	 *
	 * Counts rather than rows: the ids and the account they hang off are the
	 * new account's, so a row-for-row comparison would be a comparison of
	 * primary keys. What a restore promises is that everything you wrote is
	 * there, and a table that arrives one row short is exactly the failure
	 * nobody notices.
	 */
	const missing: string[] = [];
	for (const [table, count] of was) {
		if (count === 0) continue;
		const arrived = now.get(table) ?? 0;
		if (arrived < count) missing.push(`${table} (${arrived} of ${count})`);
	}

	const expected = missing.filter((line) => LEFT_BEHIND.some((table) => line.startsWith(table)));
	expect(missing, `tables the restore dropped that it should not have`).toEqual(expected);

	// And the picture came back as a picture, bytes and all, rather than as a
	// row with nothing behind it.
	expect(landed.data.media?.length ?? 0).toBe(1);
	expect((landed.data.media?.[0]?.bytes as string | undefined)?.length ?? 0).toBeGreaterThan(0);
	expect(landed.data.media?.[0]?.sha256).toBe(before.data.media?.[0]?.sha256);

	// The writing came with it.
	await visit(page, '/tasks/todo');
	await expect(page.getByText('water the tomatoes').first()).toBeVisible();
});
