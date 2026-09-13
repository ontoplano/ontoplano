import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The documentation fits the phone it is read on.
 *
 * Every page of docs.ontoplano.com scrolled sideways: the nav and the article
 * are a flex row aligned to the top, and the phone layout turns that row into a
 * column without saying anything about width — so `flex-start` went on deciding
 * it, and each page came out as wide as the widest table or command in it. The
 * heading, the paragraphs and the search box all moved with it, which is what
 * makes this worth a test rather than a look: nothing about the page announced
 * that it was too wide, it just would not stay still under a thumb.
 *
 * So the assertion is the arrangement itself, on every page rather than on the
 * two that were reported. Wide things are allowed — a data model is a wide
 * table and a curl line is a long line — as long as the box around them is what
 * scrolls. Anything sticking out with nothing over it that scrolls is the bug.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'build-docs');

/** Every page of the site, as the file the builder writes it to. */
const PAGES = [
	'index.html',
	...readdirSync(join(ROOT, 'docs', 'reference'))
		.filter((file) => file.endsWith('.md') && file !== 'README.md')
		.map((file) => file.replace(/\.md$/, '.html'))
];

test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

// Built here rather than found: `build-docs/` is not in the repository, and a
// test that skips when it is missing is a test that never runs. It is the
// markdown in `docs/reference/` rendered by the real builder, so what is
// measured is what the box serves.
test.beforeAll(() => {
	execFileSync('node', ['scripts/build-docs-site.mjs'], { cwd: ROOT });
});

test('no documentation page is wider than the screen', async ({ page }) => {
	for (const file of PAGES) {
		// The pages are self-contained — one inline stylesheet, no fetches — so
		// they can be measured off the disk without a server in the way.
		await page.goto(pathToFileURL(join(SITE, file)).href);

		const measured = await page.evaluate(() => {
			const room = document.documentElement.clientWidth;
			const past: string[] = [];

			for (const element of document.querySelectorAll('*')) {
				const box = element.getBoundingClientRect();
				if (!box.width && !box.height) continue;
				if (box.right <= room + 0.5) continue;

				// Something over it scrolls, so it is a table or a code block
				// behaving as it should rather than an escape.
				let held = false;
				for (let up = element.parentElement; up; up = up.parentElement) {
					if (getComputedStyle(up).overflowX !== 'visible') {
						held = true;
						break;
					}
				}
				if (held) continue;

				const classes = typeof element.className === 'string' ? element.className.trim() : '';
				past.push(
					`<${element.tagName.toLowerCase()}${classes ? ` class="${classes}"` : ''}> ends at ${Math.round(box.right)}`
				);
			}

			return { room, width: document.documentElement.scrollWidth, past };
		});

		expect(measured.past, `${file}: content that nothing scrolls sticks out`).toEqual([]);
		expect(measured.width, `${file}: the document itself scrolls sideways`).toBeLessThanOrEqual(
			measured.room
		);
	}
});
