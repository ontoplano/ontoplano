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
 * lists, block quotes, tables, fenced and inline code, bold, italic,
 * strikethrough, links, pictures you uploaded here, `#12` as a reference to a
 * diary entry, and `TASK:#4` as a reference to a task in the same notebook.
 */

import { CLOSED_STATUSES, type Status } from './task-status.js';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** What stands in for a span of code while the rest of a line is read. */
const MARKER = '\uE000';

function escape(text: string): string {
	// The marker is dropped rather than escaped: `inline` uses it to fence off
	// spans of code from its own replacements, so it must not survive in text
	// somebody typed. It is a private-use character — one with no meaning of
	// its own anywhere, which is what makes it safe to give a meaning here.
	return text.replaceAll(MARKER, '').replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/**
 * A span of code — one backtick, two or three — as CommonMark counts them.
 *
 * Three matter here because a fence typed on one line (```` ``` like this ```` )
 * is a span rather than a block: an info string cannot contain backticks, so
 * there is no block to open. It used to open one anyway, find no closing fence
 * on the next line, and render an empty `<pre>` with the words thrown away.
 */
const CODE_SPAN = /(`{1,3})([^`]+?)\1/g;

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

/**
 * Every kind of thing writing can point at by its number.
 *
 * One table, so the regex that finds a reference, the link it becomes and the
 * code that reads a pressed link back all agree — and a kind added later
 * (goals, ideas) is an entry here rather than another hand-written replace.
 *
 * - `#12` is a note: it is how one entry refers to another, from before there
 *   was anything else to refer to, and it means the note numbered 12 where it
 *   is written — the diary's own numbering in the diary, the notebook's in a
 *   notebook.
 * - `NOTE:#12` is the same pointer spelled out — how an assistant writes it,
 *   and how somebody writes it who wants the kind said.
 * - `TASK:#4` is a task in the same notebook, by its number *inside that
 *   notebook* — the fourth task about the kitchen is #4 — because a reference
 *   somebody types by hand has to be a number they can see. Turning a note's
 *   checkboxes into tasks writes these in place of the boxes.
 * - `GOAL:#2` and `IDEA:#7` are a goal and an idea in the same notebook,
 *   numbered there the way a task is.
 * - `TODO:#4` is read as `TASK:#4`. The room was called Todos when the
 *   reference was invented, and notes written then still carry that spelling;
 *   refusing it now would blank a reference in writing somebody already has.
 *   Nothing writes it any more.
 *
 * What a link carries is the kind and the number, and nothing typed: the
 * number is digits by the pattern, and the class and attribute names are this
 * table's. The thing it names is looked up by whoever caught the press, among
 * what that screen already loaded for its owner — see `refAt`.
 */
export const REFS = {
	note: {
		prefixes: ['NOTE'],
		bare: true,
		className: 'diary-ref',
		fragment: 'diary',
		refs: 'notes'
	},
	task: {
		prefixes: ['TASK', 'TODO'],
		bare: false,
		className: 'todo-ref',
		fragment: 'todo',
		refs: 'tasks'
	},
	goal: { prefixes: ['GOAL'], bare: false, className: 'goal-ref', fragment: 'goal', refs: 'goals' },
	idea: { prefixes: ['IDEA'], bare: false, className: 'idea-ref', fragment: 'idea', refs: 'ideas' }
} as const satisfies Record<
	string,
	{
		prefixes: readonly string[];
		bare: boolean;
		className: string;
		fragment: string;
		refs: keyof Refs;
	}
>;

export type RefKind = keyof typeof REFS;

/** The kind a typed prefix names, or the kind a bare `#12` means. */
export function refKindOf(prefix: string | undefined): RefKind {
	const kinds = Object.keys(REFS) as RefKind[];
	return prefix
		? kinds.find((kind) => (REFS[kind].prefixes as readonly string[]).includes(prefix))!
		: kinds.find((kind) => REFS[kind].bare)!;
}

/** Any reference: an optional `PREFIX:` and `#digits`, at the start or after a space or `(`. */
const REF_PATTERN = new RegExp(
	`(^|[\\s(])(?:(${Object.values(REFS)
		.flatMap((kind) => kind.prefixes)
		.join('|')}):)?#(\\d+)\\b`,
	'g'
);

/**
 * The link one reference becomes.
 *
 * The title and whether it is done (a task finished, a goal closed) are drawn
 * where the caller passed them; a reference rendered without them still gets a
 * link, which is what an export or a page that has not loaded the list should
 * show.
 */
function reference(before: string, prefix: string | undefined, seq: number, refs?: Refs): string {
	const kind = refKindOf(prefix);
	const { className, fragment } = REFS[kind];
	const typed = prefix ? `${prefix === 'TODO' ? 'TASK' : prefix}:#${seq}` : `#${seq}`;
	const attrs = `data-ref="${kind}" data-ref-seq="${seq}" href="#${fragment}-${seq}"`;
	// What the older readers of a link still look for: the task peek and the diary.
	const legacy =
		kind === 'task' ? ` data-todo-seq="${seq}"` : kind === 'note' ? ` data-seq="${seq}"` : '';

	// A bare `#12` keeps saying `#12`: it is how a diary reads, and naming it
	// would turn every number somebody wrote into a sentence.
	const one: { title: string; done?: boolean } | undefined = prefix
		? refs?.[REFS[kind].refs]?.get(seq)
		: undefined;
	const done = one?.done ? ' is-done' : '';
	const label = one ? `${one.done ? '\u2713 ' : ''}${escape(one.title)}` : typed;
	return `${before}<a class="${className}${done}"${legacy} ${attrs}>${label}</a>`;
}

/**
 * The reference a press or a pointer landed on, if it landed on one.
 *
 * For a screen catching presses on writing it rendered with `{@html}`, which
 * has no components to put a handler on: it listens on the block and asks
 * this what was pressed, then looks the number up among what it already has.
 */
export function refAt(
	target: EventTarget | null
): { kind: RefKind; seq: number; link: HTMLElement } | null {
	if (!(target instanceof Element)) return null;
	const link = target.closest<HTMLElement>('a[data-ref][data-ref-seq]');
	if (!link) return null;
	const kind = link.dataset.ref as RefKind;
	const seq = Number(link.dataset.refSeq);
	return kind in REFS && Number.isInteger(seq) ? { kind, seq, link } : null;
}

function inline(raw: string, refs?: Refs): string {
	let html = escape(raw);

	/*
	 * Code comes out first, and goes back in last.
	 *
	 * "What is inside a span of code is not markup" was the intention and
	 * replacing it first was not enough to keep it: every rule below still ran
	 * over the text now sitting inside the `<code>`, so `` `a * b * c` ``
	 * came out with an `<em>` in the middle of it and `` `[x](/y)` `` came out
	 * as a link. Lifting each span into a placeholder is what actually makes
	 * the rule true — nothing between here and the bottom of the function can
	 * see the characters.
	 */
	const spans: string[] = [];
	html = html.replace(CODE_SPAN, (_match, _ticks: string, code: string) => {
		// One space either side is the fence's own padding rather than part of
		// what was written: ``` x ``` is the code `x`.
		spans.push(code.replace(/^ (.*) $/, '$1'));
		return `${MARKER}${spans.length - 1}${MARKER}`;
	});

	/*
	 * A picture is one of your own, and nothing else.
	 *
	 * `![alt](/media/12)` is what the editor writes when you paste or drop a
	 * file, and the address it is allowed to point at is exactly that shape. An
	 * arbitrary one would fetch from a third party every time somebody opened
	 * the entry — telling that host who is reading, and when — which is not a
	 * thing a reader agreed to and not a thing the CSP would allow anyway. So
	 * anything else stays the text that was typed.
	 */
	html = html.replace(
		/!\[([^\]]*)\]\((\/media\/\d+)\)/g,
		(_match, alt: string, src: string) =>
			`<img class="md-image" src="${src}" alt="${alt}" loading="lazy">`
	);

	/*
	 * A recording is one of your own too, and it is a player rather than a link.
	 *
	 * The same rule the picture above follows and for the same reason: only
	 * this app's own address, nothing arbitrary. `controls preload="none"` so
	 * opening an entry with six recordings in it fetches none of them until
	 * somebody presses one.
	 *
	 * Written as an ordinary markdown link on purpose — an export, or anything
	 * else reading this text, still shows something that works. See
	 * `$lib/audio-markdown.ts`, which is where the shape is decided.
	 */
	html = html.replace(
		/(?<!!)\[([^\]]*)\]\((\/media\/audio\/\d+)\)/g,
		(_match, label: string, src: string) =>
			`<audio class="md-audio" controls preload="none" src="${src}" title="${label}"></audio>`
	);

	// `(?<!!)` so what is left of a picture — one this file refused to render —
	// is not turned into a link with a stray exclamation mark in front of it.
	html = html.replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
		const safe = safeHref(href);
		return safe
			? `<a href="${safe}" rel="noreferrer noopener" target="_blank">${label}</a>`
			: match;
	});

	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	html = html.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
	html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

	// `#12`, `NOTE:#12` and `TASK:#4` — see `REFS` below.
	html = html.replace(
		REF_PATTERN,
		(_match, before: string, prefix: string | undefined, seq: string) =>
			reference(before, prefix, Number(seq), refs)
	);

	// And the code goes back, untouched by any of the above.
	return html.replace(
		new RegExp(`${MARKER}(\\d+)${MARKER}`, 'g'),
		(_match, at: string) => `<code>${spans[Number(at)]}</code>`
	);
}

/*
 * A table is a header row, a row of dashes, and the rows under it.
 *
 * The pipe table is what everybody writes, and it is what an assistant writes
 * when asked for four settings and what each does — so a note full of them was
 * rendering as a wall of pipes. The leading and trailing pipes are optional,
 * which is how people actually type them.
 *
 * `ALIGN` is the dashes row: `:--` left, `--:` right, `:-:` centre, and a bare
 * run of dashes takes the default. It is what tells a table from two ordinary
 * lines that happen to contain a pipe.
 */
const ROW = /\|/;
const ALIGN = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;
/*
 * …unless it closes on the same line.
 *
 * ``` written twice on one line is a code span: a fenced block's info string
 * cannot contain backticks, so there is no block being opened. This read it as
 * one, found no closing fence on the lines below, and drew an empty `<pre>`
 * with everything the person had typed on that line thrown away.
 */
const ONE_LINE_FENCE = /^\s*```.*```\s*$/;

/** A fence that opens a block, as opposed to one that closes on its own line. */
function opensFence(line: string): boolean {
	return FENCE.test(line) && !ONE_LINE_FENCE.test(line);
}

/**
 * Whether the line at `at` ends the paragraph above it.
 *
 * Takes the whole text rather than one line because a table announces itself
 * on its *second* line: without that lookahead a paragraph swallowed the
 * header row and the dashes under it came out as a horizontal rule.
 */
function isBlockStart(lines: string[], at: number): boolean {
	const line = lines[at];
	return (
		HEADING.test(line) ||
		RULE.test(line) ||
		BULLET.test(line) ||
		NUMBER.test(line) ||
		QUOTE.test(line) ||
		// A fence that closes on its own line is a span inside the paragraph,
		// not the start of a block — and calling it one left the paragraph
		// loop with nothing to consume and no line to advance past.
		opensFence(line) ||
		startsTable(lines, at)
	);
}

function startsTable(lines: string[], at: number): boolean {
	return ROW.test(lines[at]) && at + 1 < lines.length && ALIGN.test(lines[at + 1]);
}

/** The cells of one row, with the optional outer pipes taken off. */
function cells(line: string): string[] {
	return line
		.trim()
		.replace(/^\||\|$/g, '')
		.split('|')
		.map((cell) => cell.trim());
}

type Align = 'left' | 'right' | 'center' | null;

function alignments(line: string): Align[] {
	return cells(line).map((cell) => {
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		if (left && right) return 'center';
		if (right) return 'right';
		if (left) return 'left';
		return null;
	});
}

function row(line: string, align: Align[], tag: 'th' | 'td', todos?: Refs): string {
	const out = cells(line).map((cell, at) => {
		const how = align[at] ? ` style="text-align: ${align[at]}"` : '';
		return `<${tag}${how}>${inline(cell, todos)}</${tag}>`;
	});
	return `<tr>${out.join('')}</tr>`;
}

function listItem(line: string, todos?: Refs): string {
	const task = TASK.exec(line);
	if (task) {
		const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
		// Disabled on purpose: the box shows what the writing says. Ticking it
		// would have to edit the text, which is a different feature.
		return `<li class="md-task"><input type="checkbox" disabled${checked} />${inline(task[2], todos)}</li>`;
	}

	const bullet = BULLET.exec(line) ?? NUMBER.exec(line);
	return `<li>${inline(bullet ? bullet[1] : line, todos)}</li>`;
}

/**
 * The tasks a piece of writing may point at, by their number in the notebook.
 *
 * Optional everywhere: the renderer is pure and a caller that has no list —
 * an export, a page that has not loaded one — still gets a link rather than
 * nothing.
 */
export type TodoRefs = Map<number, { title: string; done: boolean; task?: PeekTask }>;
/**
 * What a reference shows when it is hovered, where the screen has it — a
 * read-only card of the task. See `$lib/task-peek`.
 */
export type PeekTask = {
	title: string;
	notes: string;
	status: string;
	scheduledDate: string | null;
	categoryName: string | null;
	categoryColor: string | null;
	notebookTitle: string | null;
	archivedAt: string | null;
};
/**
 * Tasks keyed by their number in their notebook, as `TASK:#4` resolves them.
 * The caller says which notebook's: a number is only unique inside one.
 */
export function taskRefs(
	todos: readonly (PeekTask & { notebookSeq: number | null; status: Status })[]
): TodoRefs {
	return new Map(
		todos
			.filter((one) => one.notebookSeq !== null)
			.map((one) => [
				one.notebookSeq as number,
				{ title: one.title, done: CLOSED_STATUSES.includes(one.status), task: one }
			])
	);
}
/** The notes `NOTE:#N` may name, by their number. */
export type NoteRefs = Map<number, { title: string }>;
/** The goals `GOAL:#N` or ideas `IDEA:#N` may name, by their number — done is a closed goal. */
export type TitleRefs = Map<number, { title: string; done?: boolean }>;
/** What the references in a piece of writing can be resolved against. */
export type Refs = { tasks?: TodoRefs; notes?: NoteRefs; goals?: TitleRefs; ideas?: TitleRefs };

export function renderMarkdown(text: string, given?: TodoRefs | Refs): string {
	// A bare map is the tasks, which is all a reference could be before notes.
	const todos: Refs | undefined = given instanceof Map ? { tasks: given } : given;
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) {
			i++;
			continue;
		}

		if (opensFence(line)) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
			i++; // the closing fence, or the end of the text
			out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
			continue;
		}

		/*
		 * A table, which takes two lines to recognise.
		 *
		 * Before the rule test: `|---|---|` is a table's dashes row and would
		 * otherwise be read as a horizontal rule, leaving the header above it as
		 * a stray paragraph of pipes. Two lines have to agree before either is
		 * treated as a table at all, so a sentence with a pipe in it is a
		 * sentence.
		 */
		if (startsTable(lines, i)) {
			const align = alignments(lines[i + 1]);
			const head = row(line, align, 'th', todos);
			i += 2;
			const body: string[] = [];
			while (i < lines.length && lines[i].trim() && ROW.test(lines[i]))
				body.push(row(lines[i++], align, 'td', todos));
			// Its own scroller: a wide table must not take the page sideways with
			// it, which on a phone is every table of more than two columns.
			out.push(
				`<div class="md-table-scroll"><table class="md-table">` +
					`<thead>${head}</thead><tbody>${body.join('')}</tbody></table></div>`
			);
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
			out.push(`<h${level}>${inline(heading[2], todos)}</h${level}>`);
			i++;
			continue;
		}

		if (QUOTE.test(line)) {
			const quoted: string[] = [];
			while (i < lines.length && QUOTE.test(lines[i])) {
				quoted.push(QUOTE.exec(lines[i])![1]);
				i++;
			}
			out.push(
				`<blockquote>${quoted.map((one) => inline(one, todos)).join('<br />')}</blockquote>`
			);
			continue;
		}

		if (BULLET.test(line) || NUMBER.test(line)) {
			const ordered = NUMBER.test(line) && !BULLET.test(line);
			const items: string[] = [];
			while (i < lines.length && (BULLET.test(lines[i]) || NUMBER.test(lines[i]))) {
				// A run of bullets and a run of numbers are two lists, not one.
				const thisOrdered = NUMBER.test(lines[i]) && !BULLET.test(lines[i]);
				if (thisOrdered !== ordered) break;
				items.push(listItem(lines[i], todos));
				i++;
			}
			const tag = ordered ? 'ol' : 'ul';
			out.push(`<${tag}>${items.join('')}</${tag}>`);
			continue;
		}

		const paragraph: string[] = [];
		while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
			paragraph.push(inline(lines[i], todos));
			i++;
		}
		out.push(`<p>${paragraph.join('<br />')}</p>`);
	}

	return out.join('');
}
