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
	const response = await page.goto(url, { waitUntil: 'load' });

	// The response is handed back because some tests are about the status rather
	// than the screen — "this route is gone" is a 404 assertion, not a click.
	await page.waitForSelector('html[data-ready]', { timeout: 20_000 });
	return response;
}
