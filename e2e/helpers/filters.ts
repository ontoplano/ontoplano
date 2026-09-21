import type { Page } from '@playwright/test';

/**
 * The controls that narrow a task list live behind one fold button now — see
 * `FilterBar`. A spec reaches for this before pressing anything that folds:
 * the completed and archived toggles, the notebook picker, the tag picker.
 * Opening is idempotent, so a spec that has already unfolded loses nothing.
 */
export async function openFilters(page: Page): Promise<void> {
	const fold = page.locator('[aria-controls="tasks-filters"]');
	if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
}
