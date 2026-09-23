/**
 * What is inside a span of code is not markup.
 *
 * The renderer said so in a comment and did not do it: code was replaced
 * first, and then every rule below ran over the text now sitting inside the
 * `<code>`. So `` `a * b * c` `` came back with an `<em>` in the middle of it,
 * `` `**bold**` `` came back bold, and `` `[x](/y)` `` came back a link —
 * which is the opposite of what somebody wrapping a thing in backticks is
 * asking for.
 *
 * And a fence typed on one line threw the line away: ``` opens a block, no
 * closing fence follows on the next line, and what came out was an empty
 * `<pre>` where the person's sentence had been. It is a code span — a fenced
 * block's info string cannot contain backticks, so there was never a block.
 */
import { describe, expect, test } from 'vitest';

import { renderMarkdown } from '../src/lib/markdown';

describe('a span of code', () => {
	test('keeps the characters in it, whatever they would otherwise mean', () => {
		expect(renderMarkdown('run `a * b * c`')).toBe('<p>run <code>a * b * c</code></p>');
		expect(renderMarkdown('type `**bold**` here')).toBe('<p>type <code>**bold**</code> here</p>');
		expect(renderMarkdown('see `[label](/x)` literally')).toBe(
			'<p>see <code>[label](/x)</code> literally</p>'
		);
		expect(renderMarkdown('a `snake_case_name` stays')).toBe(
			'<p>a <code>snake_case_name</code> stays</p>'
		);
	});

	test('is still a span in a list, a heading and a table cell', () => {
		expect(renderMarkdown('## the `make` targets')).toBe('<h2>the <code>make</code> targets</h2>');
		expect(renderMarkdown('- run `a_b`')).toContain('<li><code>a_b</code></li>'.slice(4));
		expect(renderMarkdown('| a |\n|---|\n| `x_y` |')).toContain('<code>x_y</code>');
	});

	test('escapes what it holds, like everything else here', () => {
		expect(renderMarkdown('`<script>alert(1)</script>`')).toBe(
			'<p><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></p>'
		);
	});
});

describe('a fence', () => {
	test('that closes on its own line is a span, and keeps its words', () => {
		expect(renderMarkdown('``` this is not rendering code blocks ```')).toBe(
			'<p><code>this is not rendering code blocks</code></p>'
		);
	});

	test('that closes on its own line does not stop the paragraph around it', () => {
		// The bug this pins is worse than a wrong tag: the paragraph loop
		// treated the line as a block start, consumed nothing, and never
		// advanced — the renderer hung.
		expect(renderMarkdown('before\n``` x ```\nafter')).toBe(
			'<p>before<br /><code>x</code><br />after</p>'
		);
	});

	test('that opens a block still opens one', () => {
		expect(renderMarkdown('```\ncode here\n```\nafter')).toBe(
			'<pre><code>code here</code></pre><p>after</p>'
		);
		// The info string is the language, and is not part of the code.
		expect(renderMarkdown('```js\nlet x = 1;\n```')).toBe('<pre><code>let x = 1;</code></pre>');
	});
});
