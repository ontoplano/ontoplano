import type { Page } from '@playwright/test';

/**
 * The controls that narrow a task list live behind one fold button now — see
 * `FilterBar`. A spec reaches for this before pressing anything that folds:
 * the completed and archived toggles, the notebook picker, the tag picker.
 * Opening is idempotent, so a spec that has already unfolded loses nothing.
 */
export async function openFilters(page: Page, name = 'tasks'): Promise<void> {
	const fold = page.locator(`[aria-controls="${name}-filters"]`);
	if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
}

/**
 * The same fold over a notebook's notes, which grew one when that strip was
 * made to match the tasks tab beside it — same search box, same order, same
 * controls behind the same button.
 */
export async function openNoteFilters(page: Page): Promise<void> {
	await openFilters(page, 'notes');
}
