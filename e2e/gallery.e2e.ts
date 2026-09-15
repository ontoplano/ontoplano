import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Albums are lists of references. The same picture put in a second album is
 * one picture and two memberships — never a copy — so taking it out of one
 * album leaves it standing in the other, and taking it out of its last one
 * deletes it for real, after a confirmation that says which of the two is
 * about to happen.
 */
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
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc(body));
		return Buffer.concat([length, body, check]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(1, 0);
	ihdr.writeUInt32BE(1, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const buffer = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(Buffer.from([0, ...colour]))),
		chunk('IEND', Buffer.alloc(0))
	]);
	return { name: `dot-${colour.join('-')}.png`, mimeType: 'image/png', buffer };
}

test('a picture lives once, however many albums hold it', async ({ page }) => {
	await register(page, testEmail('gallery'));

	// Two albums.
	await visit(page, '/gallery');
	for (const name of ['Trips', 'Best of']) {
		await page.getByRole('button', { name: 'New album' }).click();
		await page.locator('[name="heading"]').fill(name);
		await page.getByRole('button', { name: 'Create', exact: true }).click();
		// The tile, not the name wherever it appears: an album is a row in the
		// folder panel as well as a card in the grid beside it.
		await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
	}

	// A picture into Trips: choosing the file is the submit.
	await page.getByRole('link', { name: /Trips/ }).click();
	await page.waitForURL(/\/gallery\/\d+/);
	// The album's own screen, not the albums index a beat earlier: the URL
	// changes before the component mounts, and setting files on the outgoing
	// page's picker uploads nothing at all.
	await expect(page.getByText('Add pictures', { exact: true })).toBeVisible();
	await page.locator('input[name="file"]:not([webkitdirectory])').setInputFiles(png([9, 120, 200]));
	await expect(page.locator('li img')).toHaveCount(1, { timeout: 15_000 });

	// Tags read like diary tags — spaces or commas — and come back as chips.
	await page.locator('li img').first().click();
	const lightbox = page.getByRole('dialog');
	await lightbox.locator('[name="tags"]').fill('#Beach family');
	await lightbox.getByRole('button', { name: 'Save tags' }).click();
	await expect(lightbox.getByRole('button', { name: '#beach' })).toBeVisible();
	await expect(lightbox.getByRole('button', { name: '#family' })).toBeVisible();

	// A rename sticks.
	await lightbox.locator('[name="heading"]').fill('the good one');
	await lightbox.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(lightbox.getByRole('heading', { name: 'the good one' })).toBeVisible();

	// Into the second album too, from the picture itself.
	await lightbox.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(/Also in: Best of/)).toBeVisible();

	// The album filters by tag, and clicking the tag again lets go.
	await lightbox.getByRole('button', { name: 'Close', exact: true }).last().click();
	await page.getByRole('button', { name: '#beach' }).click();
	await expect(page.locator('li img')).toHaveCount(1);
	await page.getByRole('button', { name: '#beach' }).click();

	// Both albums count it.
	await visit(page, '/gallery');
	const counts = page.locator('ul li a');
	await expect(counts.filter({ hasText: 'Trips' })).toContainText('1');
	await expect(counts.filter({ hasText: 'Best of' })).toContainText('1');

	// Out of Best of: the confirmation says it stays in Trips, and it does.
	await page.getByRole('link', { name: /Best of/ }).click();
	await page.waitForURL(/\/gallery\/\d+/);
	await page.locator('li img').first().click();
	await page.getByRole('button', { name: 'Remove from this album' }).click();
	await expect(page.getByText(/It stays in Trips/)).toBeVisible();
	// The Remove button is armed — a beat before it takes the click.
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: 'Remove', exact: true }).click();
	await expect(page.locator('li img')).toHaveCount(0);

	await visit(page, '/gallery');
	await expect(counts.filter({ hasText: 'Trips' })).toContainText('1');

	// Out of its last album: the confirmation says gone-for-good this time.
	await page.getByRole('link', { name: /Trips/ }).click();
	await page.waitForURL(/\/gallery\/\d+/);
	await page.locator('li img').first().click();
	await page.getByRole('button', { name: 'Remove from this album' }).click();
	await expect(page.getByText(/deleted for good/)).toBeVisible();
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: 'Remove', exact: true }).click();
	await expect(page.locator('li img')).toHaveCount(0);
});

/** A tree on disk, because a directory is what this picker takes. */
function folder(): string {
	const root = mkdtempSync(join(tmpdir(), 'ontoplano-birds-'));
	const birds = join(root, 'birds');
	mkdirSync(join(birds, 'herons'), { recursive: true });
	writeFileSync(join(birds, 'kingfisher.png'), png([7, 30, 90]).buffer);
	writeFileSync(join(birds, 'herons', 'dawn.png'), png([8, 31, 91]).buffer);
	return birds;
}

test('a folder is looked at before any of it is sent', async ({ page }) => {
	await register(page, testEmail('folder'));
	await visit(page, '/gallery');

	// The directory picker is its own: the album's own picker takes files.
	// Playwright cannot hand over a real directory, so these arrive with bare
	// names and land in "Imported" — the filing of a tree is proved in
	// tests/gallery.test.ts. What is proved here is the two presses: the
	// first says what would happen, the second does it.
	await expect(page.getByText('Import a folder')).toBeVisible();
	await page.locator('input[webkitdirectory]').setInputFiles(folder());

	await expect(page.getByText('2 pictures into 2 albums')).toBeVisible();
	// Nothing has been uploaded yet — the plan was names and sizes.
	await expect(page.getByRole('link', { name: /herons/ })).toHaveCount(0);

	await page.getByRole('button', { name: /^Import 2$/ }).click();
	await expect(page.getByText('2 pictures into 2 albums.')).toBeVisible();
	// The subfolder became an album under its parent, which is the point of
	// choosing a folder rather than files.
	await expect(page.getByRole('link', { name: /^birds/ })).toBeVisible();
});
