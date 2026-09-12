import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/** A real PNG, built here so the test needs no fixtures on disk. */
function png(colour: [number, number, number]): { name: string; mimeType: string; buffer: Buffer } {
	const table = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf: Buffer) => {
		let c = 0xffffffff;
		for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc(body));
		return Buffer.concat([length, body, check]);
	};

	const side = 4;
	const header = Buffer.alloc(13);
	header.writeUInt32BE(side, 0);
	header.writeUInt32BE(side, 4);
	header[8] = 8;
	header[9] = 2;
	const raw = Buffer.concat(
		Array.from({ length: side }, () =>
			Buffer.concat([
				Buffer.from([0]),
				Buffer.concat(Array.from({ length: side }, () => Buffer.from(colour)))
			])
		)
	);
	const buffer = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
	return { name: `dot-${colour.join('-')}.png`, mimeType: 'image/png', buffer };
}

/**
 * Install it and it works: no sign-up, no password, no server.
 *
 * This drives the artefact a phone actually ships — the static build over
 * the on-device database — so what passes here is the product's first
 * promise. The dashboard on the first paint, a todo written through the real
 * form, and the row still there after the page is torn down and reopened.
 */
test('the app opens onto a working instance and keeps what it is told', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('pageerror', (e) => console.log('PAGEERROR ' + String(e).slice(0, 300)));

	await page.goto('/');
	// No login, no welcome: the holder of the device is the account.
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	// The first open is shown around, exactly like a first visit anywhere;
	// dismissing it is remembered by the device, so it happens once.
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	await expect(tour).toBeVisible({ timeout: 15_000 });
	await tour.getByRole('button', { name: 'Dismiss' }).click();
	await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	await expect(tour).toBeHidden();

	// A write through the app's own form, into OPFS. Straight to the todo
	// list — the planner tab is not ported yet, and the point here is the
	// write path, not coverage.
	await page.goto('/tasks/todo');
	const title = `installed and working ${Date.now()}`;
	const field = page.locator('[name="heading"]');
	await expect(async () => {
		await page
			.getByRole('button', { name: /New to-do/ })
			.first()
			.click();
		await expect(field).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 30000 });
	await field.fill(title);
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });

	// The only test that matters for a record of a life: close it, open it,
	// it is still there.
	await page.reload({ waitUntil: 'load' });
	await expect(page.getByText(title)).toBeVisible({ timeout: 60_000 });
	// And the tour does not come back: its dismissal was a write too.
	await expect(page.getByRole('dialog', { name: 'Tutorial' })).toBeHidden();
});

/**
 * Pictures, which were the last room that needed a server.
 *
 * The bytes were never the hard part — they are a blob column in the same
 * SQLite file as everything else. What had to be built is the way an `<img>`
 * reaches them: a browser loads an image itself, so the fetch bridge never
 * sees `/media/3`, and the service worker asks the page, which asks the
 * database worker. This test is that path end to end, and the assertion is
 * `naturalWidth` — an image that did not decode is zero wide, whatever the
 * markup says.
 */
test('a picture is stored and drawn with no server anywhere', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('pageerror', (e) => console.log('PAGEERROR ' + String(e).slice(0, 300)));
	await page.goto('/gallery');
	await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible({ timeout: 60_000 });

	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	if (await tour.isVisible().catch(() => false)) {
		await tour.getByRole('button', { name: 'Dismiss' }).click();
		await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	}

	await page.getByRole('button', { name: 'New album' }).click();
	await page.locator('[name="heading"]').fill('On this phone');
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByRole('link', { name: /On this phone/ })).toBeVisible({ timeout: 30_000 });

	await page.getByRole('link', { name: /On this phone/ }).click();
	await expect(page.getByText('Add pictures', { exact: true })).toBeVisible({ timeout: 30_000 });
	await page.locator('input[name="file"]:not([webkitdirectory])').setInputFiles(png([12, 200, 90]));

	const picture = page.locator('li img').first();
	await expect(picture).toBeVisible({ timeout: 30_000 });
	// The service worker has to have answered for this to be anything but 0.
	await expect
		.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth), {
			timeout: 30_000
		})
		.toBeGreaterThan(0);

	// And it is still there, and still draws, after the app is closed and opened.
	await page.reload({ waitUntil: 'load' });
	const again = page.locator('li img').first();
	await expect(again).toBeVisible({ timeout: 60_000 });
	await expect
		.poll(() => again.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 })
		.toBeGreaterThan(0);
});

/**
 * A screen that needs a server says so, rather than looking broken.
 *
 * The account, mail, anything with somebody else in it: there is no twin for
 * those and there cannot be. What must not happen is what did — the data
 * request for such a page ends in `.json`, the bridge's asset test read that
 * as a file, and it went to whatever is serving the app's files. That answers
 * an unknown path with an empty 404, which the phone rendered as a 500 and
 * this file server as "that page is not here". Absent is a sentence; broken
 * is a bug report.
 */
test('a screen with no twin says it needs a server', async ({ page }) => {
	test.setTimeout(120_000);

	await page.goto('/');
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	const answer = await page.evaluate(async () => {
		const res = await fetch('/settings/account/__data.json');
		return { status: res.status, body: await res.text() };
	});
	expect(answer.status).toBe(501);
	expect(answer.body).toMatch(/needs an instance with a server/);
});

/**
 * Leaving, from a device that is its own instance.
 *
 * There is no account here — no address, no sessions, nothing anybody else
 * can see — so the press that opens the account everywhere else opens the
 * screen that chooses where your ontoplano lives. It is also the only way
 * off a phone-only instance, which is why it cannot be a page that needs a
 * server.
 */
test('the phone can leave the instance it is', async ({ page }) => {
	test.setTimeout(120_000);
	// The bar this press lives in is the phone's.
	await page.setViewportSize({ width: 420, height: 900 });

	await page.goto('/');
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	/*
	 * The tour, if this is the first open here.
	 *
	 * Its dismissal is remembered by the device, so whether it is up depends on
	 * whether a test before this one has already been shown around — which is
	 * not something this test should care about. It covers the bar, so a press
	 * on the bar cannot land until it is gone.
	 */
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	if (await tour.isVisible()) {
		await tour.getByRole('button', { name: 'Dismiss' }).click();
		await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
		await expect(tour).toBeHidden();
	}

	await page.getByRole('link', { name: 'Where this lives' }).click();
	await expect(page.getByRole('heading', { name: /Where your ontoplano lives/ })).toBeVisible({
		timeout: 30_000
	});

	// The connected one is chosen first, and its own paragraph is showing.
	await expect(page.getByRole('radio', { name: /Connect to an instance/ })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(page.getByText(/assistants can reach it over MCP/)).toBeVisible();

	// And the other one says what it costs before anybody presses it.
	await page.getByRole('radio', { name: /This phone only/ }).click();
	await expect(page.getByText(/nothing is backed up/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Keep it on this phone' })).toBeEnabled();
});
