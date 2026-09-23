import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The browser tab says where you are.
 *
 * Every page said "Ontoplano", which is useless the moment two of them are
 * open — and the planner and the notes side by side is the ordinary way to
 * use this.
 */
test('each room names itself in the tab', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('page-title'));

	/*
	 * The tab and the room share a name here, and a title says it once: the
	 * tab was called "To-do" when this was written and is called "Tasks" now,
	 * so "Tasks · Tasks · Ontoplano" is what the dedup exists to prevent.
	 */
	await visit(page, '/tasks/todo');
	await expect(page).toHaveTitle(/^Tasks · Ontoplano/);

	await visit(page, '/goals');
	await expect(page).toHaveTitle(/Goals · Ontoplano/);

	// A room whose tab carries the room's own name says it once.
	await visit(page, '/notebooks');
	await expect(page).toHaveTitle(/^Notebooks · Ontoplano/);

	/*
	 * And the instance's own name is what ends it — "Ontoplano", or the marked
	 * one a staging, demo or dev build wears, which is what the suite runs
	 * against.
	 */
	expect(await page.title()).toMatch(/Ontoplano( — Dev| staging| demo)?$/);
});
