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

export async function register(page: Page, email: string, name = 'Smoke Test'): Promise<void> {
	clients += 1;
	await page.setExtraHTTPHeaders({
		'x-forwarded-for': `10.42.${Math.floor(clients / 250)}.${(clients % 250) + 1}`
	});

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
	if (page.url().includes('/welcome')) {
		await page.getByRole('button', { name: 'Start planning' }).click();
		await page.waitForTimeout(1500);
	}

	// And then the dashboard, which is where a person goes next and which is
	// what generates the current week's occurrences from the template that
	// onboarding just installed. Without this the account has weekly slots and
	// no blocks, which is a state nobody using the app is ever in for long.
	await page.goto('/', { waitUntil: 'networkidle' });
}
