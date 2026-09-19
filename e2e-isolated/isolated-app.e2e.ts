import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';

import { REMINDER_CHANNEL } from '../src/lib/reminder-channel';

/** Wait until nothing on the flower is still moving. */
async function settled(page: import('@playwright/test').Page): Promise<void> {
	await page
		.locator('.fan')
		.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

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
/**
 * Every room the device is supposed to have, actually reachable.
 *
 * A screen the bridge has no route for falls through to the file host, which
 * answers an unknown path with an empty 404 — so a room that was never ported
 * looks like a room that does not exist, and the only way to find out is to
 * open it. Recipes and the address book were exactly that for months: both
 * work on the device and both were on the list of things it refuses.
 */
test('every room that runs on the device opens on it', async ({ page }) => {
	test.setTimeout(180_000);
	const rooms = [
		'/tasks/todo',
		'/tasks/board',
		'/goals',
		'/notebooks',
		'/notebooks/diary',
		'/notebooks/people',
		'/health/habits',
		'/health/recipes',
		'/health/workouts',
		'/finance/ledgers',
		'/finance/bills',
		'/media/audios',
		'/media/gallery',
		'/inventory',
		'/reminders'
	];

	await page.goto('/');
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	const missing: string[] = [];
	for (const room of rooms) {
		const answer = await page.evaluate(async (path) => {
			const res = await fetch(`${path}/__data.json`);
			return res.status;
		}, room);
		if (answer !== 200) missing.push(`${room} -> ${answer}`);
	}

	expect(missing).toEqual([]);
});

/**
 * A picture put into a note, on a device with nothing behind it.
 *
 * The composer posts the file to `/media` and writes the address it answers
 * with into the markdown. `/media` is not under `/api`, and the bridge used to
 * ask the device only about `/api` — so this answered "this screen needs an
 * instance with a server", about bytes that were only ever going to live on
 * this phone.
 */
test('a picture goes into a note on the device', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/notebooks/diary');
	await expect(page.getByRole('heading', { name: 'Notebooks' })).toBeVisible({ timeout: 60_000 });

	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	if (await tour.isVisible().catch(() => false)) {
		await tour.getByRole('button', { name: 'Dismiss' }).click();
		await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	}

	// Straight at the endpoint the composer uses: what this is about is whether
	// the device answers it at all, and driving a file picker adds nothing.
	const answer = await page.evaluate(async () => {
		// A one-pixel GIF, which is a real picture as far as the store is concerned.
		const bytes = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), (c) =>
			c.charCodeAt(0)
		);
		const form = new FormData();
		form.append('file', new File([bytes], 'dot.gif', { type: 'image/gif' }));
		const res = await fetch('/media', { method: 'POST', body: form });
		return { status: res.status, body: await res.json().catch(() => null) };
	});

	expect(answer.status).toBe(200);
	// And the markdown it hands back points at a picture this device can draw.
	expect(answer.body?.markdown).toMatch(/!\[.*]\(\/media\/\d+\)/);
});

/**
 * A thing made on the device is on the screen at once.
 *
 * Reported twice: creating a ledger appears to do nothing until the page is
 * reloaded, in the app but not in a desktop browser. On the device every write
 * goes through the bridge — the action runs in the worker and the page's data
 * is re-fetched from it — so this is where that round trip is pinned.
 */
test('a ledger made on the device appears without a reload', async ({ page }) => {
	test.setTimeout(120_000);
	// As the app launches it, mark and all: on a device with no server there is
	// nothing to redirect the mark away, so every request carries it.
	await page.goto('/finance/ledgers?app=android');
	await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible({ timeout: 60_000 });

	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	if (await tour.isVisible().catch(() => false)) {
		await tour.getByRole('button', { name: 'Dismiss' }).click();
		await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	}

	await page.getByRole('button', { name: 'New ledger' }).first().click();
	// `[name=...]`, not `input[name=...]`: `OneLine` is a textarea that behaves
	// like a single-line field, which is what this selector got wrong before.
	await page.locator('[name="heading"]').fill('Money on this phone');
	await page.getByRole('button', { name: 'Create', exact: true }).click();

	// No reload, no second navigation: the list is what the action changed.
	await expect(page.getByText('Money on this phone').first()).toBeVisible({ timeout: 15_000 });
});

test('a picture is stored and drawn with no server anywhere', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('pageerror', (e) => console.log('PAGEERROR ' + String(e).slice(0, 300)));
	await page.goto('/media/gallery');
	// The room is Media; Gallery is one of its tabs.
	await expect(page.getByRole('heading', { name: 'Media' }).first()).toBeVisible({
		timeout: 60_000
	});

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

	// Billing, because it is about a subscription to something somebody else
	// runs. Account used to stand here and no longer can: a device has one now
	// — its data out, its data in, and the end of the instance.
	const answer = await page.evaluate(async () => {
		const res = await fetch('/settings/billing/__data.json');
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
	 * Shown around already, said before anything is pressed.
	 *
	 * The tour covers the bar, so nothing here can be pressed while it is up —
	 * and looking for it and dismissing it does not work: the shell starts it
	 * half a second after the page mounts, so on a loaded machine the check
	 * runs first, finds nothing, and the tour then opens over the flower. This
	 * is the same thing the tour's own dismissal posts, which makes "already
	 * seen" true before there is anything to dismiss.
	 */
	await page.evaluate(() =>
		fetch('/api/tutorial', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ seen: true })
		})
	);
	await page.reload({ waitUntil: 'load' });
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });
	await expect(page.getByRole('dialog', { name: 'Tutorial' })).toBeHidden();

	/*
	 * Through the account, which a device has now.
	 *
	 * The bar's last button used to be this link. It opens the flower of small
	 * things instead, and the account in its middle is a real screen here — the
	 * data out, the data in, and the end of the instance — with leaving as one
	 * of the things on it, exactly where a server instance keeps it.
	 */
	await page.getByRole('button', { name: 'Account and help' }).click();
	// The flower flies its petals out; clicking one mid-flight is asking for
	// an element that is still moving, which on a loaded machine never settles
	// inside the timeout. Wait for the movement rather than for a guess at it.
	await settled(page);
	await page.getByRole('menuitem', { name: 'Account' }).click();
	// One card about which ontoplano this is, and its action is the chooser —
	// there were two of them saying nearly the same thing, and the one called
	// "Change instance" was the half that went.
	await page.getByRole('link', { name: 'Switch instance' }).click();
	await expect(page.getByRole('heading', { name: /Where your Ontoplano lives/ })).toBeVisible({
		timeout: 30_000
	});

	// The connected one is chosen first, and its own paragraph is showing.
	await expect(page.getByRole('radio', { name: /Cloud instance/ })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(page.getByRole('heading', { name: 'Connect to an external server' })).toBeVisible();
	await expect(page.getByText('Works with AI assistants')).toBeVisible();

	/*
	 * And the other one says what it costs before anybody presses it — as a
	 * list, because this is the one decision in the app that cannot be undone
	 * by pressing something else later. Each line is marked with what it is:
	 * four plain lines read as four good things whichever column they are in.
	 */
	await page.getByRole('radio', { name: /On device/ }).click();
	await expect(page.getByRole('heading', { name: /on the phone only/ })).toBeVisible();
	await expect(page.getByText('No backups')).toBeVisible();
	await expect(page.getByText('Fully offline')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start isolated instance' })).toBeEnabled();
});

/**
 * The settings a device has, and the one it must not offer.
 *
 * `AI & Integrations` is every way other software reaches this instance — an
 * assistant, a calendar subscription, a webhook, a data stream — and a
 * phone-only instance is not on a network at all. It appeared the day a device
 * got an account page, because one flag was gating both.
 */
test('settings offers nothing that needs somebody else to connect', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/settings/preferences');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 60_000 });

	const tabs = await page.locator('nav[aria-label="Settings sections"] a').allInnerTexts();
	expect(tabs).toContain('Account');
	expect(tabs).toContain('Preferences');
	expect(tabs.join(' ')).not.toMatch(/Integrations|Billing|Family|Administration/);
});

/**
 * An endpoint that answers "nothing to say" does not throw.
 *
 * 204, 205 and 304 forbid a body, and the `Response` constructor refuses one —
 * so the bridge handing back what the worker sent threw inside `fetch` rather
 * than answering. Dismissing the tour is exactly that shape: it posts to
 * `/api/tutorial`, which answers 204, and on the device that meant the
 * dismissal was never recorded and the tour came back on the next screen.
 */
test('an endpoint that answers with no content is answered, not thrown', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	const answered = await page.evaluate(async () => {
		const res = await fetch('/api/tutorial', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ seen: true })
		});
		return { status: res.status, body: await res.text() };
	});

	expect(answered).toEqual({ status: 204, body: '' });
});

/**
 * The main menu says which of the two you are in.
 *
 * Somebody can be running both — the instance on this device and one on a
 * server — and they are the same app to look at, which is a bad way to find
 * out which week you have just written into. The mark keeps all its colour
 * here and changes the field behind the bird, which `yarn icons` repaints into
 * `mark-isolated.png`.
 *
 * The derived artwork and nothing else: it is the same drawing with one colour
 * swapped, not a second drawing that would drift from it the day the logo is
 * replaced.
 */
test('the main menu’s mark wears the device’s own field', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/tasks/todo');

	const handle = page.locator('.pie-handle').first();
	await expect(handle).toBeVisible({ timeout: 60_000 });

	/*
	 * The handle first, because that is the menu when it is shut.
	 *
	 * Marking only the open wheel left the bar as the ordinary one until you
	 * pressed and held it — and a mark that changes colour on its way up makes
	 * one object look like two.
	 */
	await expect
		.poll(() =>
			handle
				.locator('img')
				.first()
				.evaluate((el) => (el as HTMLImageElement).currentSrc)
		)
		.toMatch(/mark-isolated/);

	const box = await handle.boundingBox();
	if (!box) throw new Error('the menu has no handle to press');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();

	const mark = page.locator('.pie-mark image').first();
	await expect(mark).toBeVisible();
	await expect
		.poll(() => mark.evaluate((el) => el.getAttribute('href') ?? el.getAttribute('xlink:href')))
		.toMatch(/mark-isolated/);

	await page.mouse.up();
});

/**
 * And the screen that answers "what am I looking at" answers it.
 *
 * The drained mark is a glance; this is the sentence behind it. Somebody can
 * be running this copy and one behind a server at the same time, so the
 * Instance tab names which of the two this is before it says anything about
 * versions.
 */
test('the Instance tab says this one is isolated', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/settings/instance');

	await expect(page.getByText('What is running')).toBeVisible({ timeout: 60_000 });
	// The word and the sentence under it are one `dd`, so this asks the row
	// rather than the words: `exact` would want a node holding only "Isolated".
	await expect(page.getByText(/^Isolated/)).toBeVisible();
	await expect(page.getByText(/This device, on its own/)).toBeVisible();
});

/**
 * A block starting later today reaches Android's alarm clock.
 *
 * This is the whole of how a reminder arrives on an instance that runs on the
 * phone: there is no server to wake it, so the app hands the next few weeks to
 * the system while it is open and the system fires them on its own clock. Four
 * things have to hold in a row, every one of them silent when it fails:
 *
 *   the setting is on → the pass writes a row for the block → the row comes
 *   back from `/api/reminders?upcoming=1` → the plugin is asked to book it.
 *
 * "No notification arrived" is what all four look like, which is why the test
 * goes the whole way rather than stopping at the row. The shell is stubbed,
 * because the one thing a browser cannot do is be Android — what is checked is
 * that the app asked it the right question.
 */
test.describe('booking with Android', () => {
	/*
	 * As the app, not as a browser.
	 *
	 * `phoneNotifications()` asks the user agent before it looks for a plugin —
	 * the shell is the only thing that can book an alarm, and a browser that
	 * happens to have a `Capacitor` object on `window` is not it. Without this
	 * the stub below is never reached and the test fails for a reason that has
	 * nothing to do with reminders.
	 */
	test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14) Mobile OntoplanoApp/0.1.0` });

	test('a block that is still to come is booked with Android', async ({ page }) => {
		test.setTimeout(180_000);

		/*
		 * The shell, recording what it was asked to book.
		 *
		 * An exposed function rather than something on `window`: the page reloads
		 * in the middle of this, and anything kept in the page is lost with it.
		 */
		const booked: { id: number; at: string; channelId?: string }[] = [];
		await page.exposeFunction(
			'__booked',
			(what: { id: number; at: string; channelId?: string }[]) => {
				booked.push(...what);
			}
		);
		await page.addInitScript(() => {
			const record = (window as never as Record<string, (what: unknown) => Promise<void>>).__booked;
			(window as never as Record<string, unknown>).Capacitor = {
				Plugins: {
					LocalNotifications: {
						checkPermissions: async () => ({ display: 'granted' }),
						requestPermissions: async () => ({ display: 'granted' }),
						getPending: async () => ({ notifications: [] }),
						cancel: async () => {},
						createChannel: async () => {},
						schedule: async (what: {
							notifications: { id: number; schedule: { at: Date }; channelId?: string }[];
						}) => {
							await record(
								what.notifications.map((n) => ({
									id: n.id,
									at: new Date(n.schedule.at).toISOString(),
									channelId: n.channelId
								}))
							);
						}
					}
				}
			};
		});

		/*
		 * Already asked, and the answer was this phone.
		 *
		 * As the app, a launch with nothing written down goes to the instance
		 * screen rather than the dashboard — which is right, and is not what
		 * this test is about. Written where the app writes it, so the launch
		 * behaves like somebody's second one.
		 */
		await page.addInitScript(() => {
			try {
				localStorage.setItem('ontoplano:instance', 'phone');
			} catch {
				// A profile that refuses storage: the chooser below handles it.
			}
		});

		await page.goto('/');
		// Either the dashboard, or the chooser if the line above did not take.
		const chooser = page.getByRole('button', { name: /Use this phone|Start here/i });
		if (await chooser.isVisible({ timeout: 10_000 }).catch(() => false)) await chooser.click();

		await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });
		const tour = page.getByRole('dialog', { name: 'Tutorial' });
		if (await tour.isVisible().catch(() => false)) {
			await tour.getByRole('button', { name: 'Dismiss' }).click();
			await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
		}

		/*
		 * Two days out, at nine in the morning, in UTC on both sides.
		 *
		 * Three separate versions of this test have been about timezones rather
		 * than about reminders. "Three hours from now" is a time in *this*
		 * machine's zone and the form judges it in the *account's*. Then the
		 * hour was built with `setHours`, which is local to the test process —
		 * and the browser is pinned to UTC, so a shell that happened to export
		 * TZ moved the expectation three hours and not the app.
		 *
		 * The browser's zone is fixed by the config, so both ends are built in
		 * it: the day, the hour typed into the form, and the instant expected
		 * back. Two days ahead so it is in the future whatever else is true.
		 */
		const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
		const pad = (n: number) => String(n).padStart(2, '0');
		const expected = Date.UTC(
			soon.getUTCFullYear(),
			soon.getUTCMonth(),
			soon.getUTCDate(),
			9,
			0,
			0
		);
		await page.goto('/reminders');
		// The form is behind "New reminder" in the room's bar.
		await page.getByRole('button', { name: /New reminder/ }).click();
		await expect(page.locator('[name="day"]')).toBeVisible({ timeout: 30_000 });
		await page
			.locator('[name="day"]')
			.fill(`${soon.getUTCFullYear()}-${pad(soon.getUTCMonth() + 1)}-${pad(soon.getUTCDate())}`);
		await page.locator('[name="time"]').fill('09:00');
		await page.locator('[name="label"]').first().fill('booked with android');
		await page.getByRole('button', { name: 'Set it' }).click();
		await expect(page.getByText('booked with android')).toBeVisible({ timeout: 30_000 });

		/*
		 * And now the part that was never checked: opening the app hands what is
		 * coming to the system. It happens on mount, so this is a reload rather
		 * than a click.
		 */
		booked.length = 0;
		await page.reload();
		await expect(page.locator('html[data-ready]')).toBeAttached({ timeout: 60_000 });

		await expect
			.poll(() => booked.length, {
				message: 'the app never asked Android to book anything',
				timeout: 30_000
			})
			.toBeGreaterThan(0);

		// The right minute, and on the channel that makes a sound — a booking on
		// the plugin's default channel is a notification that arrives in silence.
		const mine = booked.find((b) => Math.abs(Date.parse(b.at) - expected) < 60_000);
		expect(
			mine,
			`nothing was booked near ${new Date(expected).toISOString()}: ${JSON.stringify(booked)}`
		).toBeTruthy();
		/*
		 * The constant, not a copy of what it said when this was written: the
		 * id has to change whenever a channel needs different settings, since
		 * Android fixes a channel's importance the first time it is made and
		 * ignores every attempt to raise it afterwards.
		 */
		expect(mine!.channelId).toBe(REMINDER_CHANNEL);
	});
});
