import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './markdown';

/**
 * The renderer's job is two things: turn a small vocabulary into HTML, and
 * never let anything the user typed become markup it did not ask for. The
 * second half is why these tests exist at all.
 */
describe('escaping', () => {
	test('a script tag is text', () => {
		expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script');
		expect(renderMarkdown('<script>alert(1)</script>')).toContain('&lt;script&gt;');
	});

	test('an attribute cannot be broken out of', () => {
		// The quotes are escaped, so there is no tag to hang a handler on — the
		// whole thing stays the text somebody typed.
		const html = renderMarkdown('[x](" onmouseover="alert(1))');
		expect(html).not.toContain('<a ');
		expect(html).toContain('&quot;');
	});

	test('a javascript: link is left as text', () => {
		const html = renderMarkdown('[click](javascript:alert(1))');
		expect(html).not.toContain('href="javascript');
	});

	test('an http link survives', () => {
		expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
	});
});

describe('blocks', () => {
	test('headings', () => {
		expect(renderMarkdown('# One')).toBe('<h1>One</h1>');
		expect(renderMarkdown('### Three')).toBe('<h3>Three</h3>');
	});

	test('a line of dashes is a rule, not an underlined heading', () => {
		expect(renderMarkdown('Test\n\n---')).toContain('<hr />');
	});

	test('bullets and numbers are different lists', () => {
		const html = renderMarkdown('- a\n- b\n\n1. c\n2. d');
		expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
		expect(html).toContain('<ol><li>c</li><li>d</li></ol>');
	});

	test('a task list is checkboxes, and a ticked one is checked', () => {
		const html = renderMarkdown('- [ ] open\n- [x] shut');
		expect(html).toContain('type="checkbox" disabled');
		expect(html).toContain('checked');
	});

	test('fenced code keeps its contents literal', () => {
		expect(renderMarkdown('```\n**not bold**\n```')).toContain(
			'<pre><code>**not bold**</code></pre>'
		);
	});
});

describe('inline', () => {
	test('bold, italic, strikethrough, code', () => {
		expect(renderMarkdown('**b**')).toContain('<strong>b</strong>');
		expect(renderMarkdown('a *i* b')).toContain('<em>i</em>');
		expect(renderMarkdown('~~gone~~')).toContain('<s>gone</s>');
		expect(renderMarkdown('`x`')).toContain('<code>x</code>');
	});

	test('a diary reference becomes a link', () => {
		expect(renderMarkdown('see #12')).toContain('href="#diary-12"');
	});

	test('a heading is not mistaken for a reference', () => {
		expect(renderMarkdown('# Capítulo 1')).toBe('<h1>Capítulo 1</h1>');
	});
});

/**
 * Pictures, and the addresses they are allowed to have.
 *
 * The rule is narrow on purpose: `/media/<id>` is a row in this instance's own
 * database, and anything else — a third-party host, a `data:` payload, a
 * traversal dressed up as an id — stays the text that was typed rather than
 * becoming a tag.
 */
describe('pictures', () => {
	test('one of your own becomes an image', () => {
		const html = renderMarkdown('![a cake](/media/12)');
		expect(html).toContain('<img class="md-image" src="/media/12" alt="a cake"');
		expect(html).toContain('loading="lazy"');
	});

	test('somebody else’s host does not', () => {
		for (const src of [
			'https://tracker.example/pixel.png',
			'//tracker.example/pixel.png',
			'data:image/svg+xml;base64,PHN2Zz4=',
			'/media/12/../../etc/passwd',
			'/media/abc',
			'javascript:alert(1)'
		]) {
			const html = renderMarkdown(`![x](${src})`);
			expect(html, src).not.toContain('<img');
		}
	});

	test('a refused picture is not turned into a link either', () => {
		expect(renderMarkdown('![x](https://tracker.example/p.png)')).not.toContain('<a ');
	});

	test('the alt text cannot carry markup', () => {
		const html = renderMarkdown('![" onerror="alert(1)](/media/3)');
		expect(html).not.toContain('onerror="alert');
		expect(html).toContain('&quot;');
	});

	test('an ordinary link still works beside them', () => {
		expect(renderMarkdown('[docs](https://example.com)')).toContain('href="https://example.com"');
	});
});

describe('tables', () => {
	const TABLE = ['| constant | now |', '| --- | --- |', '| `TURN_MS` | 300 |'].join('\n');

	test('a header, its dashes and its rows become a table', () => {
		const html = renderMarkdown(TABLE);
		expect(html).toContain('<table class="md-table">');
		expect(html).toContain('<th>constant</th>');
		expect(html).toContain('<td><code>TURN_MS</code></td>');
		expect(html).toContain('<td>300</td>');
	});

	/*
	 * The dashes row is also a horizontal rule, and the header row is also an
	 * ordinary sentence. Both were true before this, which is why a note full
	 * of tables came out as a wall of pipes with rules through it.
	 */
	test('the dashes row is not read as a horizontal rule', () => {
		expect(renderMarkdown(TABLE)).not.toContain('<hr />');
	});

	test('a paragraph above one is not swallowed into it', () => {
		const html = renderMarkdown(`the four knobs:\n${TABLE}`);
		expect(html).toContain('<p>the four knobs:</p>');
		expect(html).toContain('<th>constant</th>');
	});

	test('the outer pipes are optional', () => {
		const html = renderMarkdown('a | b\n--- | ---\n1 | 2');
		expect(html).toContain('<th>a</th><th>b</th>');
		expect(html).toContain('<td>1</td><td>2</td>');
	});

	test('a colon in the dashes says which way the column reads', () => {
		const html = renderMarkdown('| a | b | c |\n| :-- | --: | :-: |\n| 1 | 2 | 3 |');
		expect(html).toContain('<th style="text-align: left">a</th>');
		expect(html).toContain('<th style="text-align: right">b</th>');
		expect(html).toContain('<th style="text-align: center">c</th>');
	});

	test('a sentence that happens to contain a pipe is a sentence', () => {
		const html = renderMarkdown('run it with cat file | grep thing');
		expect(html).not.toContain('<table');
		expect(html).toContain('<p>');
	});

	test('it scrolls on its own rather than taking the page sideways', () => {
		expect(renderMarkdown(TABLE)).toContain('<div class="md-table-scroll">');
	});

	test('cells are escaped like everything else', () => {
		const html = renderMarkdown('| a |\n| --- |\n| <script>x</script> |');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});
