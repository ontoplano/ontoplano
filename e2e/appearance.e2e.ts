import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers/account';
import { COLOUR_TOOLS } from './helpers/colour';
import { visit } from './helpers/visit';

/**
 * Whether you can see what you are looking at.
 *
 * Four combinations ship — light and dark, sober and playful — and a rule
 * written for one of them can be invisible in another. That is not
 * hypothetical: a ticked checkbox rendered as a near-white box with a white
 * tick on it in dark mode, so there was no way to tell it apart from an
 * unticked one, and it took a person to notice.
 */
const COMBINATIONS = [
	{ theme: 'light', style: 'sober' },
	{ theme: 'light', style: 'playful' },
	{ theme: 'dark', style: 'sober' },
	{ theme: 'dark', style: 'playful' }
] as const;

async function paint(page: Page, theme: string, style: string): Promise<void> {
	await page.evaluate(
		([t, s]) => {
			document.documentElement.dataset.theme = t;
			document.documentElement.dataset.style = s;
		},
		[theme, style]
	);
	await page.waitForTimeout(150);
}

test('the tick on a ticked box can be seen', async ({ page }) => {
	await register(page, `tick-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/board');

	const box = page.locator('input[type=checkbox]').first();
	await expect(box).toBeVisible();
	await box.check();

	for (const { theme, style } of COMBINATIONS) {
		await paint(page, theme, style);

		const seen = await box.evaluate((el, tools) => {
			const { toRGBA, contrast } = new Function(tools)();
			const cs = getComputedStyle(el);

			// The mark itself is a background image the forms plugin draws, and its
			// colour is baked into the data URI.
			const encoded = decodeURIComponent(cs.backgroundImage);
			const fill = encoded.match(/fill=['"]?(#[0-9a-fA-F]{3,8}|[a-z]+)/)?.[1] ?? '#fff';

			return { ratio: contrast(toRGBA(fill), toRGBA(cs.backgroundColor)), fill };
		}, COLOUR_TOOLS);

		expect(
			seen.ratio,
			`${theme}/${style}: the ${seen.fill} tick is invisible on the box it sits in`
		).toBeGreaterThan(3);
	}
});

test('a checkbox is a square, in every style', async ({ page }) => {
	await register(page, `shapes-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/board');

	const box = page.locator('input[type=checkbox]').first();
	await expect(box).toBeVisible();

	for (const { theme, style } of COMBINATIONS) {
		await paint(page, theme, style);
		const shape = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { radius: parseFloat(cs.borderRadius), size: parseFloat(cs.width) };
		});

		// Half the width or more is a circle, and a circle means one-of: a
		// checkbox shaped like a radio lies about how many you may pick.
		expect(shape.radius, `${theme}/${style}: the checkbox reads as a radio`).toBeLessThan(
			shape.size / 2
		);
	}
});

test('an unticked box is not the same colour as the page', async ({ page }) => {
	await register(page, `empty-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/board');

	const box = page.locator('input[type=checkbox]').first();
	await expect(box).toBeVisible();
	await box.uncheck();

	for (const { theme, style } of COMBINATIONS) {
		await paint(page, theme, style);
		const ratio = await box.evaluate((el, tools) => {
			const { toRGBA, contrast, groundOf } = new Function(tools)();
			const cs = getComputedStyle(el);
			return contrast(toRGBA(cs.borderTopColor), groundOf(el.parentElement));
		}, COLOUR_TOOLS);

		expect(ratio, `${theme}/${style}: an empty checkbox has no visible outline`).toBeGreaterThan(
			1.6
		);
	}
});

test('text stands off its background, on every theme', async ({ page }) => {
	await register(page, `contrast-${Date.now()}@test.invalid`);

	// Collected across every route and combination, then asserted once. Failing
	// on the first offender would mean fixing these one browser run at a time.
	const found: string[] = [];

	for (const route of [
		'/',
		'/tasks/board',
		'/inventory',
		'/goals',
		'/notebooks/diary',
		'/notebooks'
	]) {
		await page.goto(route, { waitUntil: 'load' });

		for (const { theme, style } of COMBINATIONS) {
			await paint(page, theme, style);

			const unreadable = await page.evaluate((tools) => {
				const { toRGBA, contrast, groundOf } = new Function(tools)();

				const offenders: string[] = [];
				for (const el of document.querySelectorAll('body *')) {
					// Only elements holding text of their own.
					const text = [...el.childNodes]
						.filter((n) => n.nodeType === Node.TEXT_NODE)
						.map((n) => n.textContent?.trim())
						.join('')
						.trim();
					if (!text) continue;

					const rect = el.getBoundingClientRect();
					if (rect.width === 0 || rect.height === 0) continue;

					const cs = getComputedStyle(el);
					if (cs.visibility === 'hidden' || +cs.opacity < 0.9) continue;
					if ((el as HTMLInputElement).disabled) continue;
					// Text over an image or a gradient has no single ground to compare
					// against, and guessing one is how this test invents failures.
					if (cs.backgroundImage !== 'none') continue;

					const fg = toRGBA(cs.color);
					if (fg[3] < 250) continue; // deliberately faded; a different question
					const ratio = contrast(fg, groundOf(el));

					const size = parseFloat(cs.fontSize);
					const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
					if (ratio >= (large ? 3 : 4.5)) continue;

					const line = `${el.className || el.tagName} at ${cs.fontSize} — ${ratio.toFixed(2)}:1 ("${text.slice(0, 24)}")`;
					if (!offenders.includes(line)) offenders.push(line);
				}
				return offenders;
			}, COLOUR_TOOLS);

			found.push(...unreadable.map((o) => `${route} ${theme}/${style} — ${o}`));
		}
	}

	expect(found, 'text nobody can comfortably read').toEqual([]);
});

test('a button you cannot press does not look like one you can', async ({ page }) => {
	await register(page, `disabled-${Date.now()}@test.invalid`);

	// The review's carry button is disabled until something is ticked, which is
	// the general case: a form whose action needs a selection. Onboarding filled
	// *this* week, and the page defaults to the last one, so ask for this one.
	const today = new Date().toISOString().slice(0, 10);
	await visit(page, `/tasks/review?week=${today}`);

	const carry = page.getByRole('button', { name: /carry into the todo list/i });
	await expect(carry).toBeVisible();

	for (const { theme, style } of COMBINATIONS) {
		await paint(page, theme, style);
		const look = await carry.evaluate((el) => ({
			disabled: (el as HTMLButtonElement).disabled,
			opacity: parseFloat(getComputedStyle(el).opacity),
			cursor: getComputedStyle(el).cursor
		}));

		expect(look.disabled, `${theme}/${style}: expected the button to be disabled`).toBe(true);
		expect(look.opacity, `${theme}/${style}: a dead button at full strength`).toBeLessThan(0.7);
		expect(look.cursor).toBe('not-allowed');
	}
});

/**
 * Every button keeps its label under the pointer.
 *
 * `.btn:hover` outranks `.btn-primary` — one class and a pseudo-class beats one
 * class — so the hover rule's `color` repainted the primary button's white
 * label to gray-900: near-black on near-black in the light theme, near-white on
 * near-white in the dark one. The label vanished in both, and every other test
 * here passed, because none of them hovers anything.
 *
 * The variants are mounted rather than hunted for on a page. The contract is
 * the stylesheet's, not any one screen's: a page that happens not to render a
 * danger button today would quietly stop covering it, which is how the rule got
 * broken in the first place.
 */
test('a button keeps its label under the pointer', async ({ page }) => {
	await register(page, `hover-${Date.now()}@test.invalid`);
	await visit(page, '/goals');

	const VARIANTS = [
		'btn',
		'btn btn-primary',
		'btn btn-danger',
		'btn btn-quiet',
		'btn btn-outline',
		'btn btn-sm'
	];

	await page.evaluate((variants) => {
		const bench = document.createElement('div');
		bench.id = 'hover-bench';
		bench.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;display:flex;gap:8px';
		bench.innerHTML = variants
			.map((c, i) => `<button id="hb${i}" class="${c}">New goal</button>`)
			.join('');
		// Also the pressed state, which sets its own ink.
		bench.insertAdjacentHTML(
			'beforeend',
			`<button id="hb${variants.length}" class="btn" aria-pressed="true">On</button>`
		);
		document.body.appendChild(bench);
	}, VARIANTS);

	const faded: string[] = [];

	for (const { theme, style } of COMBINATIONS) {
		await paint(page, theme, style);

		for (let i = 0; i <= VARIANTS.length; i += 1) {
			const button = page.locator(`#hb${i}`);
			await button.hover();
			// Longer than the 120ms colour transition, or this reads a colour the
			// button is only passing through.
			await page.waitForTimeout(200);

			const seen = await button.evaluate((el, tools) => {
				const { toRGBA, contrast, groundOf } = new Function(tools)();
				const cs = getComputedStyle(el);
				return {
					variant: el.className || 'btn[aria-pressed]',
					ratio: contrast(toRGBA(cs.color), groundOf(el))
				};
			}, COLOUR_TOOLS);

			if (seen.ratio < 4.5)
				faded.push(`${theme}/${style} — .${seen.variant}: ${seen.ratio.toFixed(2)}:1 on hover`);
		}
	}

	await page.evaluate(() => document.getElementById('hover-bench')?.remove());

	expect(faded, 'a button whose label disappears under the pointer').toEqual([]);
});

/**
 * A button says it is a button, under the pointer.
 *
 * Tailwind v4's reset gives buttons `cursor: default` where v3 left the
 * browser's `pointer`. Nothing in the app said otherwise, so every link
 * advertised itself as pressable and every button did not — a menu row that
 * submits a form read as dead text beside the three above it that navigate.
 *
 * Asked of the real buttons on a real page rather than of the rule, because the
 * rule is only worth having if it survives the specificity of everything else.
 */
test('every button on a page offers a pointer', async ({ page }) => {
	await register(page, `cursor-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/board');

	const wrong = await page.evaluate(() => {
		const bad: string[] = [];
		for (const el of document.querySelectorAll('button')) {
			const button = el as HTMLButtonElement;
			if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
			// Only what somebody can actually point at.
			const box = button.getBoundingClientRect();
			if (box.width === 0 || box.height === 0) continue;

			const cursor = getComputedStyle(button).cursor;
			if (cursor !== 'pointer') {
				bad.push(`${button.textContent?.trim().slice(0, 24) || button.className}: ${cursor}`);
			}
		}
		return bad;
	});

	expect(wrong, 'buttons that do not look pressable').toEqual([]);
});
