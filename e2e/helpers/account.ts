import type { Page } from '@playwright/test';

/**
 * An account with a week's worth of things in it.
 *
 * Every page that only breaks once it has something to draw — the grid, the
 * board, the goal picker — needs one, and a suite that only ever sees empty
 * pages tests the empty states and nothing else.
 */
export const PASSWORD = 'smoke-test-password';

/**
 * Registration is rate limited per client address, and a suite that registers
 * an account per test spends that budget within a few files. The server trusts
 * `X-Forwarded-For` here — see the config — so each account arrives from an
 * address of its own, which is also nearer the truth than pretending one
 * machine registered nine accounts in a minute.
 */
let clients = 0;

/**
 * Workers do not share the counter, so without the worker index two of them
 * hand out the same address and the account-creation limit — which is per
 * address and tight on purpose — fails a test that has nothing to do with it.
 */
const WORKER = Number(process.env.TEST_PARALLEL_INDEX ?? 0);

/**
 * A distinct address per account, for any test that makes one.
 *
 * Not decoration: account creation is rate limited per address, tightly and on
 * purpose, so a fixture that registers nine accounts from one address is
 * testing the rate limiter. It is also nearer the truth — nine people do not
 * sign up from one machine in four seconds.
 */
export function clientAddress(): string {
	clients += 1;
	return `10.${42 + WORKER}.${Math.floor(clients / 250)}.${(clients % 250) + 1}`;
}

export async function register(
	page: Page,
	email: string,
	name = 'Smoke Test',
	/** Leave the first-run tour up, for the one suite that is about it. */
	keepTour = false
): Promise<void> {
	await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientAddress() });

	await page.goto('/login', { waitUntil: 'networkidle' });

	const register = page.getByRole('button', { name: 'Register' });
	if (await register.count()) {
		await register.click();
		await page.waitForTimeout(200);
	}

	await page.fill('input[name=name]', name);
	await page.fill('input[name=email]', email);
	await page.fill('input[name=password]', PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();

	try {
		await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
	} catch {
		// Whatever the form is complaining about is more useful than a timeout.
		const said = await page.locator('form').innerText();
		throw new Error(`could not register ${email}. The page said:\n${said}`);
	}

	// First run lands on onboarding; take the offered week so the grid, the board
	// and the dashboard all have something to draw.
	//
	// It is a wizard now — one question a step — so this walks to the end rather
	// than pressing the finish button straight away. Every step arrives with an
	// answer already in it, so pressing Next is accepting the defaults, which is
	// exactly what this helper wants; the finish button only exists on the last
	// step, which is how this used to hang.
	if (page.url().includes('/welcome')) {
		for (let step = 0; step < 8; step += 1) {
			const next = page.getByRole('button', { name: 'Next', exact: true });
			if ((await next.count()) === 0) break;
			await next.click();
			await page.waitForTimeout(150);
		}
		await page.getByRole('button', { name: 'Start planning' }).click();
		await page.waitForTimeout(1500);
	}

	// And then the dashboard, which is where a person goes next and which is
	// what generates the current week's occurrences from the template that
	// onboarding just installed. Without this the account has weekly slots and
	// no blocks, which is a state nobody using the app is ever in for long.
	await page.goto('/', { waitUntil: 'networkidle' });

	// A new account is shown around, once, on this screen — so every test that
	// makes one would otherwise start behind a modal. Dismissed here rather than
	// suppressed, because that is what a person does and because it is the only
	// way the flag it writes gets written.
	if (!keepTour) await dismissTour(page);
}

/**
 * Close the guided tour if it has come up.
 *
 * Two presses, deliberately: the first goes to the closing step that says where
 * the tour lives afterwards, the second ends it. Silent when no tour appears —
 * an account that has already seen it is not a failure.
 */
export async function dismissTour(page: Page): Promise<void> {
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	try {
		await tour.waitFor({ state: 'visible', timeout: 4000 });
	} catch {
		return;
	}
	await tour.getByRole('button', { name: 'Dismiss' }).click();
	await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	await tour.waitFor({ state: 'hidden' });
}
