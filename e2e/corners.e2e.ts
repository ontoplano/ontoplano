import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Nothing that touches a screen edge has a corner.
 *
 * A rounded corner needs a gap around it to read as a corner. Against the edge
 * of the screen it is a notch of whatever is behind the app showing through,
 * and it reads as a rendering fault rather than as a radius.
 *
 * This is here because that defect was reported five separate times in as many
 * places — a card, a title, two columns of a split, a segmented control — and
 * each was a real instance of it, and none was the reason it kept coming back.
 * The reason was `.page-surface`: the shell is `100dvh` tall, fills the width,
 * clips what is inside it, and had picked up the playful style's blanket 8px
 * along with every other box. It bit all four corners out of every page in the
 * app.
 *
 * So the check is not "is this component square". It is: whatever happens to
 * be in the corner of the screen, is it square — which is the only form of the
 * question that cannot be satisfied by fixing one component and moving on.
 */
const CORNERS = [
	{ name: 'top left', x: 2, y: 2 },
	{ name: 'top right', x: -2, y: 2 },
	{ name: 'bottom left', x: 2, y: -2 },
	{ name: 'bottom right', x: -2, y: -2 }
] as const;

/** The rooms most likely to differ: a split, a list, a form, the dashboard. */
const ROOMS = ['/', '/notebooks', '/tasks/todo', '/inventory', '/settings/account'];

for (const width of [390, 1280]) {
	test(`nothing in a screen corner is rounded at ${width}px`, async ({ page }) => {
		test.setTimeout(240_000);
		await page.setViewportSize({ width, height: 844 });
		await register(page, testEmail(`corners-${width}`));

		for (const room of ROOMS) {
			await visit(page, room);

			const round = await page.evaluate((corners) => {
				const bad: string[] = [];
				for (const corner of corners) {
					const x = corner.x < 0 ? window.innerWidth + corner.x : corner.x;
					const y = corner.y < 0 ? window.innerHeight + corner.y : corner.y;
					/*
					 * Every element under that point, not only the topmost: the one
					 * doing the clipping is usually an ancestor of whatever is
					 * painted there.
					 */
					for (const el of document.elementsFromPoint(x, y)) {
						const box = el.getBoundingClientRect();
						// Only the ones actually reaching the edge. A card inset from
						// it is allowed its corners, and should have them.
						if (box.left > 2 || box.top > 2) continue;
						if (box.width < window.innerWidth - 4) continue;
						const radius = getComputedStyle(el).borderTopLeftRadius;
						if (radius !== '0px' && radius !== '') {
							const name = (el.className?.baseVal ?? el.className ?? el.tagName).toString();
							bad.push(`${corner.name}: ${name.slice(0, 60)} has ${radius}`);
						}
					}
				}
				return bad;
			}, CORNERS);

			expect(round, `${room} at this width`).toEqual([]);
		}
	});
}
