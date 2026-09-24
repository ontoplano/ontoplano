import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A task's labels are what the row says, not what can be done to it.
 *
 * They share a line with the row's buttons, and that whole line was drawn at a
 * third of its strength until the pointer was over it — so a label's ink came
 * out a grey nobody could read: "this text and border should be black, it was
 * black before". The fade belongs to the controls.
 *
 * And the buttons never came back: the rule that restores a faded row named
 * two of the three classes that fade, and not this one.
 */
/** The opacity actually applied to an element, ancestors multiplied in. */
const strengthOf = (selector: string) => `(() => {
	let node = document.querySelector(${JSON.stringify(selector)});
	let strength = 1;
	while (node) {
		strength *= Number(getComputedStyle(node).opacity);
		node = node.parentElement;
	}
	return strength;
})()`;

test('a label keeps its ink while the row’s buttons are held back', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('label-ink'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New task' }).first().click();
	await page.locator('[name="heading"]').first().fill('A task with a label');
	await page.locator('input[role="combobox"]').first().fill('done-by-ai');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByRole('button', { name: '#done-by-ai' }).first()).toBeVisible();

	// Full strength, whatever the pointer is doing.
	expect(await page.evaluate(strengthOf('.task-labels'))).toBe(1);

	// The buttons beside them are held back until the row is under the pointer,
	// and then they are not.
	const held = await page.evaluate(strengthOf('.task-actions .icon-btn'));
	expect(held).toBeLessThan(1);

	await page.locator('.task-actions').first().hover();
	await expect.poll(async () => page.evaluate(strengthOf('.task-actions .icon-btn'))).toBe(1);
});
