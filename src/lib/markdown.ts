/**
 * The small subset of Markdown the app understands.
 *
 * Deliberately hand-written rather than a library: what goes through here is
 * the user's own writing, rendered with `{@html}`, so the escaping has to be
 * ours and the vocabulary has to be small enough to read in one sitting. Every
 * line is escaped before any tag is produced, and the only attributes emitted
 * are ones this file writes itself.
 *
 * Supported: headings, horizontal rules, bullet and numbered lists, task
 * lists, block quotes, fenced and inline code, bold, italic, strikethrough,
 * links, and `#12` as a reference to a diary entry.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escape(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/**
 * A link is only followed if it goes somewhere obviously safe.
 *
 * `javascript:` and `data:` URLs in somebody's own diary would only ever hurt
 * them, but a note can be pasted from anywhere, so anything that is not an
 * ordinary web or in-app address is left as the text the user typed.
 */
function safeHref(href: string): string | null {
	return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : null;
}

function inline(raw: string): string {
	let html = escape(raw);

	html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
		const safe = safeHref(href);
		return safe
			? `<a href="${safe}" rel="noreferrer noopener" target="_blank">${label}</a>`
			: match;
	});

	// Code first: what is inside a span of code is not markup.
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	html = html.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
	html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

	// `#12` is how one entry refers to another.
	html = html.replace(
		/(^|[\s(])#(\d+)\b/g,
		'$1<a class="diary-ref" data-seq="$2" href="#diary-$2">#$2</a>'
	);

	return html;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;

function isBlockStart(line: string): boolean {
	return (
		HEADING.test(line) ||
		RULE.test(line) ||
		BULLET.test(line) ||
		NUMBER.test(line) ||
		QUOTE.test(line) ||
		FENCE.test(line)
	);
}

function listItem(line: string): string {
	const task = TASK.exec(line);
	if (task) {
		const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
		// Disabled on purpose: the box shows what the writing says. Ticking it
		// would have to edit the text, which is a different feature.
		return `<li class="md-task"><input type="checkbox" disabled${checked} />${inline(task[2])}</li>`;
	}

	const bullet = BULLET.exec(line) ?? NUMBER.exec(line);
	return `<li>${inline(bullet ? bullet[1] : line)}</li>`;
}

export function renderMarkdown(text: string): string {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) {
			i++;
			continue;
		}

		if (FENCE.test(line)) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
			i++; // the closing fence, or the end of the text
			out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
			continue;
		}

		// Before the heading test, so a line of dashes is a rule rather than an
		// underlined heading — which is what somebody typing `---` means.
		if (RULE.test(line)) {
			out.push('<hr />');
			i++;
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			const level = heading[1].length;
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			i++;
			continue;
		}

		if (QUOTE.test(line)) {
			const quoted: string[] = [];
			while (i < lines.length && QUOTE.test(lines[i])) {
				quoted.push(QUOTE.exec(lines[i])![1]);
				i++;
			}
			out.push(`<blockquote>${quoted.map(inline).join('<br />')}</blockquote>`);
			continue;
		}

		if (BULLET.test(line) || NUMBER.test(line)) {
			const ordered = NUMBER.test(line) && !BULLET.test(line);
			const items: string[] = [];
			while (i < lines.length && (BULLET.test(lines[i]) || NUMBER.test(lines[i]))) {
				// A run of bullets and a run of numbers are two lists, not one.
				const thisOrdered = NUMBER.test(lines[i]) && !BULLET.test(lines[i]);
				if (thisOrdered !== ordered) break;
				items.push(listItem(lines[i]));
				i++;
			}
			const tag = ordered ? 'ol' : 'ul';
			out.push(`<${tag}>${items.join('')}</${tag}>`);
			continue;
		}

		const paragraph: string[] = [];
		while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
			paragraph.push(inline(lines[i]));
			i++;
		}
		out.push(`<p>${paragraph.join('<br />')}</p>`);
	}

	return out.join('');
}
