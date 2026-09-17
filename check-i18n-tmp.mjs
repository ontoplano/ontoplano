import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const OUT =
	'/tmp/claude-1000/-workspace/938995a9-3c2b-45e4-b542-dd3b354e620a/scratchpad/screenshots';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

async function login() {
	await page.goto(`${BASE}/login`);
	await page.getByLabel(/email/i).fill('t@example.com');
	await page.getByLabel(/password/i).fill('devdev12345');
	await page.getByRole('button', { name: /sign in|log in/i }).click();
	await page.waitForURL(/\/(home|tasks|welcome)?$/, { timeout: 15000 }).catch(() => {});
}

await login();
console.log('logged in, url =', page.url());

await page.goto(`${BASE}/settings/preferences`);
await page.waitForTimeout(1000);
const text = await page.locator('body').innerText();
const langLines = text.split('\n').filter((l) => /english|português|deutsch|español/i.test(l));
console.log('Preferences language lines:', JSON.stringify(langLines, null, 1));
await page.screenshot({ path: `${OUT}/preferences-en.png`, fullPage: true });

async function switchTo(locale, label) {
	// find the select or radio for language and set it
	const select = page
		.locator('select')
		.filter({ has: page.locator(`option:has-text("${label}")`) });
	if (await select.count()) {
		await select.first().selectOption({ label });
	} else {
		await page.getByText(label, { exact: false }).first().click();
	}
	await page.waitForTimeout(1500);
}

for (const [locale, label] of [
	['de', 'Deutsch'],
	['es', 'Español']
]) {
	await switchTo(locale, label);
	await page.screenshot({ path: `${OUT}/preferences-${locale}.png`, fullPage: true });

	await page.goto(`${BASE}/tasks/plan`);
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${OUT}/tasks-${locale}.png`, fullPage: true });

	await page.goto(`${BASE}/`);
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${OUT}/home-${locale}.png`, fullPage: true });

	const untranslatedCount = await page.locator('[data-untranslated]').count();
	console.log(`${locale}: ${untranslatedCount} [data-untranslated] elements on /home`);

	await page.goto(`${BASE}/settings/preferences`);
	await page.waitForTimeout(1000);
}

await browser.close();
console.log('done');
