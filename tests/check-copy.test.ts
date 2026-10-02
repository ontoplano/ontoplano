import { describe, expect, it } from 'vitest';
import { copyIn } from '../scripts/check-copy.mjs';

describe('check-copy', () => {
	it('does not read a regex ending in an escaped slash as a comment', () => {
		// `\/\//` used to blank the `}` after it, and every attribute below
		// was then read as a string inside an expression.
		const source = `<a>{url.replace(/^https:\\/\\//, '')}</a>
<span class="hidden xl:inline">{t('a.b')}</span>
<div style="padding-top: calc(var(--x, 0px) + 0.5rem)"></div>`;
		expect(copyIn(source)).toEqual([]);
	});
});
