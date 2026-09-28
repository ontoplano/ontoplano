import type { Page, Response } from '@playwright/test';

/**
 * Go to a page, and wait until it is actually running.
 *
 * Every test used to `goto(…, { waitUntil: 'networkidle' })`, which waited for
 * an idle network and *meant* "the app has hydrated and will answer a
 * keystroke". Those are two different things, and the day the app started
 * holding a live-update stream open the first one stopped ever happening — a
 * stream is a request that never completes, so the network is never idle.
 *
 * The root layout sets `data-ready` on `<html>` from an effect, which only runs
 * in a browser and only after hydration. Waiting for that is what the tests
 * always meant, and it is faster and more certain than waiting for silence.
 */
export async function visit(page: Page, url: string): Promise<Response | null> {
	await settleHistory(page);
	const response = await page.goto(url, { waitUntil: 'load' });

	// The response is handed back because some tests are about the status rather
	// than the screen — "this route is gone" is a 404 assertion, not a click.
	await page.waitForSelector('html[data-ready]', { timeout: 20_000 });
	return response;
}

/** How long a closed dialog's step back through history is given to land. */
const HISTORY_SETTLE_MS = 5_000;

/*
 * On a phone a dialog holds a history entry, and closing it steps back through
 * history — a frame or two later. A `goto` issued in that gap is cancelled by
 * the step landing (`net::ERR_ABORTED`). A person cannot type an address that
 * fast; a test can, so it waits until no closed dialog still holds an entry.
 * An open one is left alone: a test may mean to leave with it open.
 */
async function settleHistory(page: Page): Promise<void> {
	await page
		.waitForFunction(
			() => {
				const held = (history.state?.['sveltekit:states'] as { backCloses?: number[] } | undefined)
					?.backCloses;
				return !held?.length || document.querySelector('dialog[open]') !== null;
			},
			null,
			{ timeout: HISTORY_SETTLE_MS }
		)
		.catch(() => undefined);
}
