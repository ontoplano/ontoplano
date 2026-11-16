import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The menu list in Preferences, which saves itself.
 *
 * There is no Save button: every tick, arrow and colour sends the form after
 * a short wait. The form says `data-saving="true"` from the press until the
 * answer and the reload behind it are in, so a spec waits on that rather than
 * on one response — several quick presses can be more than one save.
 */
export function menuList(page: Page): Locator {
	return page.locator('form[action="?/saveMenu"]');
}

export async function changeMenu(page: Page, act: () => Promise<void>): Promise<void> {
	await act();
	await expect(menuList(page)).toHaveAttribute('data-saving', 'false', { timeout: 30_000 });
}
