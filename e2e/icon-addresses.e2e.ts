import { expect, test } from '@playwright/test';

/**
 * Every address an icon is fetched from answers with an icon.
 *
 * `/favicon.ico` is the one nothing links to and everything asks for: a
 * browser fetches it before it has read a line of the page, and so does
 * anything that wants a picture for a link without rendering the page — a chat
 * unfurling a URL, a feed reader, the card an assistant draws for a connector.
 * There was no such file here, so the request fell through to the SPA fallback
 * and those callers were handed a page where an image should have been. That
 * fails silently in exactly the places nobody is looking.
 *
 * The manifest's own icons are checked for the other half of it: a name in
 * there that no file answers to is a launcher tile, or a long-press shortcut,
 * drawn as nothing at all.
 */
test('/favicon.ico is an icon, not the page', async ({ request }) => {
	const answer = await request.get('/favicon.ico');
	expect(answer.status()).toBe(200);
	expect(answer.headers()['content-type']).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);

	const bytes = await answer.body();
	// ICO's own header: reserved 0, type 1 (an icon rather than a cursor), and
	// at least one image in it.
	expect(bytes.readUInt16LE(0)).toBe(0);
	expect(bytes.readUInt16LE(2)).toBe(1);
	expect(bytes.readUInt16LE(4)).toBeGreaterThan(0);
});

test('every icon the manifest names is there', async ({ request }) => {
	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.status()).toBe(200);
	const said = await manifest.json();

	const named = [
		...said.icons.map((one: { src: string }) => one.src),
		...said.shortcuts.flatMap((one: { icons: { src: string }[] }) =>
			one.icons.map((icon) => icon.src)
		)
	];
	// The three launcher shortcuts and the tiles: a manifest that names none of
	// them would pass every assertion below by having nothing to check.
	expect(named.length).toBeGreaterThan(4);

	for (const src of named) {
		const answer = await request.get(src);
		expect(answer.status(), src).toBe(200);
		expect(answer.headers()['content-type'], src).toContain('image/png');
	}
});
