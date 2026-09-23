import type { Page } from '@playwright/test';

/**
 * The controls that narrow a list are out on the page wherever there is room
 * for them — see `FilterBar` — and behind one button on a phone, where there
 * is not. A spec reaches for this before pressing one of them: it opens the
 * phone's sheet and does nothing at all on a wider screen, so the same spec
 * reads the same way at both widths.
 */
export async function openFilters(page: Page, name = 'tasks'): Promise<void> {
	const controls = page.locator(`#${name}-filters`);
	if (await controls.isVisible().catch(() => false)) return;

	const sheet = page.locator('.filter-toggle');
	if ((await sheet.count()) > 0) await sheet.first().click();
}

/**
 * The same over a notebook's notes, which grew the same strip when that tab
 * was made to match the tasks tab beside it — same search box, same count,
 * same order, same controls.
 */
export async function openNoteFilters(page: Page): Promise<void> {
	await openFilters(page, 'notes');
}
