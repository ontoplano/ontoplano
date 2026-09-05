import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { notebooks } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { ValidationError } from './errors.js';
import { createEntry, MAX_ENTRY_LENGTH } from './diary.js';
import { createNotebook } from './notebooks.js';
import { createTodo, MAX_NOTES_LENGTH, MAX_TITLE_LENGTH } from './todos.js';

/**
 * Bringing a list in from somewhere else.
 *
 * The top reason people do not adopt a planner is that everything they already
 * wrote down is in the last one. So this takes what Todoist and Google Tasks
 * actually hand you when you ask for your data — a CSV per project, and
 * Takeout's JSON — and turns it into todos.
 *
 * Todos, and not blocks, because that is what these apps hold: a title, some
 * notes, sometimes a day. Neither of them knows what an hour of your week is
 * for, so inventing one here would be putting words in somebody's mouth. What
 * arrives lands in the strip beside the planner grid, ready to be given a time.
 *
 * Every import goes into a notebook of its own. That is not filing for its own
 * sake — it is the undo: one delete puts the account back, and a notebook that
 * goes takes nothing with it (`notebooks.ts` disowns rather than cascades).
 */

/** One task, in the shape both sources are reduced to before anything is written. */
export type ImportedTask = {
	title: string;
	notes: string;
	done: boolean;
	/** `YYYY-MM-DD`, or null when the source said something we do not parse. */
	dueDate: string | null;
	/**
	 * What the source actually wrote there, when it was not a date.
	 *
	 * Todoist's date column is free text — "every day", "tomorrow", "in 3 days"
	 * — and only a real date is read. Keeping the original is what lets the
	 * result say "9 of these repeat, and repeats did not come across" instead of
	 * saying nothing.
	 */
	rawDate: string | null;
	/** The project or list it came from, where the file says. */
	list: string | null;
};

/** A text note, which is writing rather than a thing to do. */
export type ImportedNote = {
	title: string | null;
	body: string;
	/** Comma-separated, the way the entry service reads tags. */
	tags: string;
};

export type ParseResult = {
	tasks: ImportedTask[];
	/** Notes that are writing, not tasks — they become notebook entries. */
	notes: ImportedNote[];
	/** Lines we understood well enough to know we were dropping them. */
	skipped: string[];
	/** A name the file itself carries — org's #+TITLE — for the notebook. */
	suggestedNotebook?: string;
};

export type ImportResult = {
	/** Everything that landed, tasks and notes together. */
	imported: number;
	importedTasks: number;
	importedNotes: number;
	notebook: string;
	skipped: string[];
	/** How many carried a date the source wrote in a way we do not read. */
	datesDropped: number;
};

/** Beyond this a paste is somebody's whole life, and it needs a conversation. */
const MAX_INPUT = 2_000_000;
const MAX_TASKS = 2000;

export type ImportSource = 'todoist' | 'google-tasks' | 'google-keep' | 'org';

/** What each is called, where a person will read it. */
export const SOURCE_NAMES: Record<ImportSource, string> = {
	todoist: 'Todoist',
	'google-tasks': 'Google Tasks',
	'google-keep': 'Google Keep',
	org: 'Org mode'
};

/**
 * Which of the two this is, without asking.
 *
 * Both files announce themselves plainly — one starts with Todoist's own header
 * row, the other is JSON — and a person exporting their tasks should not have
 * to know which radio button matches the file they just downloaded.
 */
export function detectSource(text: string): ImportSource | null {
	const head = text.trimStart().slice(0, 4000);
	if (head.startsWith('{') || head.startsWith('[')) {
		// Keep and Tasks are both Takeout JSON, and neither says its own name.
		// They are told apart by the fields only one of them has: a Keep note
		// carries its body as `textContent` or its ticks as `listContent`, and
		// a Tasks export is one object whose `items` are lists.
		return /"(textContent|listContent|isTrashed|isArchived)"/.test(head)
			? 'google-keep'
			: 'google-tasks';
	}
	if (/^\s*"?TYPE"?\s*,/i.test(head)) return 'todoist';
	// Org mode: star headings, and at least one of the marks only org makes —
	// a TODO/DONE keyword on a heading, or a #+ directive.
	if (
		/^\*+\s/m.test(head) &&
		(/^\*+\s+(TODO|NEXT|WAITING|DONE|CANCELLED)\b/m.test(head) || /^#\+/m.test(head))
	)
		return 'org';
	return null;
}

/* ------------------------------------------------------------------- CSV */

/**
 * A CSV reader that survives what a task manager exports.
 *
 * `line.split(',')` is wrong here and not by a little: a Todoist task called
 * "Buy milk, bread" becomes two cells, and a description with a newline in it
 * becomes two rows. So: quotes, doubled quotes inside them, newlines inside
 * them, and CRLF — which is RFC 4180 and nothing more.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];

		if (quoted) {
			if (c === '"') {
				// A doubled quote is a literal one; a single quote ends the field.
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				cell += c;
			}
			continue;
		}

		if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			// CRLF is one break, not two.
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}

	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}

	// A trailing newline leaves one empty row behind; so do blank lines.
	return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/* --------------------------------------------------------------- Todoist */

/** `2026-09-04`, and the front of anything that starts with one. */
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Todoist's own CSV, as its "Export as template → CSV" writes it.
 *
 * The columns that matter are TYPE, CONTENT, DESCRIPTION, PRIORITY, INDENT and
 * DATE. Three shapes appear in the TYPE column and each is a decision:
 *
 *  - `task` — a todo.
 *  - `note` — a comment belonging to the task above it. Appended to that task's
 *    notes rather than dropped, because a comment is usually where the actual
 *    instruction is.
 *  - `section` — a heading inside the project. Ontoplano has no such thing
 *    inside a notebook, so it is reported rather than silently swallowed.
 *
 * Sub-tasks (INDENT above 1) come in flat. Nesting is a shape this app does not
 * have, and inventing a "parent: " prefix would make somebody edit every one of
 * them to get rid of it.
 *
 * The DATE column is free text — "every day", "tomorrow", "in 3 days" — and only
 * a real date is read. A repeat rule is not a date, and guessing what "every
 * day" meant to somebody else is how an import puts wrong things in a calendar.
 */
export function parseTodoistCsv(text: string): ParseResult {
	const rows = parseCsv(text);
	if (rows.length === 0) return { tasks: [], notes: [], skipped: [] };

	const header = rows[0].map((h) => h.trim().toUpperCase());
	const at = (name: string) => header.indexOf(name);
	const iType = at('TYPE');
	const iContent = at('CONTENT');
	const iDescription = at('DESCRIPTION');
	const iDate = at('DATE');

	if (iType === -1 || iContent === -1) {
		throw new ValidationError('That does not look like a Todoist export — no TYPE/CONTENT header');
	}

	const tasks: ImportedTask[] = [];
	const skipped: string[] = [];

	for (const row of rows.slice(1)) {
		const type = (row[iType] ?? '').trim().toLowerCase();
		const content = (row[iContent] ?? '').trim();
		if (!content) continue;

		if (type === 'section') {
			skipped.push(`section “${content}”`);
			continue;
		}

		if (type === 'note') {
			// Belongs to the task above it. With no task above, it is a project
			// comment and there is nowhere for it to go.
			const previous = tasks.at(-1);
			if (!previous) {
				skipped.push('a comment with no task above it');
				continue;
			}
			previous.notes = [previous.notes, content]
				.filter(Boolean)
				.join('\n\n')
				.slice(0, MAX_NOTES_LENGTH);
			continue;
		}

		if (type !== 'task') continue;

		const raw = (row[iDate] ?? '').trim();
		tasks.push({
			title: content.slice(0, MAX_TITLE_LENGTH),
			notes: (row[iDescription] ?? '').trim().slice(0, MAX_NOTES_LENGTH),
			// A Todoist CSV export holds the open tasks; completed ones are not in it.
			done: false,
			dueDate: ISO_DATE.exec(raw)?.[1] ?? null,
			rawDate: raw || null,
			list: null
		});
	}

	return { tasks, notes: [], skipped };
}

/* ---------------------------------------------------------- Google Tasks */

type TakeoutList = { title?: unknown; items?: unknown };
type TakeoutItem = { title?: unknown; notes?: unknown; status?: unknown; due?: unknown };

/**
 * Google Takeout's `Tasks.json`.
 *
 * One object with `items`, each of which is a *list* that itself has `items` —
 * the tasks. A completed task carries `status: "completed"`, and `due` is a full
 * RFC 3339 stamp of which only the date half means anything: Google stores a due
 * date as midnight UTC, so reading the time would move half the world's tasks a
 * day.
 */
export function parseGoogleTasks(text: string): ParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ValidationError('That file is not JSON — export Tasks from Google Takeout');
	}

	const lists = (parsed as { items?: unknown })?.items;
	if (!Array.isArray(lists)) {
		throw new ValidationError('No task lists in that file — it should be Takeout’s Tasks.json');
	}

	const tasks: ImportedTask[] = [];
	const skipped: string[] = [];

	for (const list of lists as TakeoutList[]) {
		const listName = typeof list?.title === 'string' ? list.title.trim() : null;
		const items = Array.isArray(list?.items) ? (list.items as TakeoutItem[]) : [];

		for (const item of items) {
			const title = typeof item?.title === 'string' ? item.title.trim() : '';
			if (!title) {
				// Google keeps blank rows somebody made and never typed into.
				skipped.push('a task with no title');
				continue;
			}

			const due = typeof item?.due === 'string' ? item.due : '';
			tasks.push({
				title: title.slice(0, MAX_TITLE_LENGTH),
				notes: (typeof item?.notes === 'string' ? item.notes : '')
					.trim()
					.slice(0, MAX_NOTES_LENGTH),
				done: item?.status === 'completed',
				dueDate: ISO_DATE.exec(due)?.[1] ?? null,
				rawDate: due || null,
				list: listName
			});
		}
	}

	return { tasks, notes: [], skipped };
}

/* ----------------------------------------------------------- Google Keep */

type KeepNote = {
	title?: unknown;
	textContent?: unknown;
	listContent?: unknown;
	isTrashed?: unknown;
	isArchived?: unknown;
	labels?: unknown;
	createdTimestampUsec?: unknown;
};

/**
 * Google Keep, which is not Google Tasks and never was.
 *
 * Takeout writes Keep as **one JSON file per note**, which is the awkward part:
 * a person with four hundred notes has four hundred files. So the page reads
 * however many were chosen and hands this a JSON array of them; a single note
 * on its own is accepted too, because that is what one file holds.
 *
 * What a note becomes:
 *
 * - A checklist note (`listContent`) becomes one todo per line, which is what
 *   its ticks already were. The note's title, if it has one, goes in the notes
 *   of each so the line keeps its context.
 * - A text note becomes a notebook note — it is writing, not a thing to do,
 *   and a body buried in a todo's notes field is a body nobody reads again.
 *   The title becomes a heading over it, and Keep's labels come across as
 *   tags.
 *
 * Both land in the one notebook, so deleting that notebook still undoes the
 * whole import.
 *
 * Trashed notes are never imported. Archived ones are, because archived in
 * Keep means "dealt with but keep it", which is not the same as deleted.
 */
export function parseGoogleKeep(text: string): ParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ValidationError('That file is not JSON — export Keep from Google Takeout');
	}

	const files = Array.isArray(parsed) ? parsed : [parsed];
	const tasks: ImportedTask[] = [];
	const notes: ImportedNote[] = [];
	const skipped: string[] = [];

	for (const raw of files as KeepNote[]) {
		if (!raw || typeof raw !== 'object') continue;

		if (raw.isTrashed === true) {
			skipped.push('a note in the bin');
			continue;
		}

		const title = typeof raw.title === 'string' ? raw.title.trim() : '';
		const body = typeof raw.textContent === 'string' ? raw.textContent.trim() : '';
		const list = Array.isArray(raw.listContent) ? raw.listContent : [];
		const label = title ? `From “${title}”.` : null;

		if (list.length > 0) {
			for (const entry of list as { text?: unknown; isChecked?: unknown }[]) {
				const line = typeof entry?.text === 'string' ? entry.text.trim() : '';
				if (!line) continue;
				tasks.push({
					title: line.slice(0, MAX_TITLE_LENGTH),
					notes: (label ?? '').slice(0, MAX_NOTES_LENGTH),
					done: entry?.isChecked === true,
					dueDate: null,
					rawDate: null,
					// Not `list`: that names the notebook everything lands in, and a
					// Keep export is many notes rather than one list. The note's own
					// title is already in the notes above.
					list: null
				});
			}
			continue;
		}

		if (!title && !body) {
			skipped.push('an empty note');
			continue;
		}

		// Writing, not a task. Keep's labels are its own tags, and they come
		// across as ours.
		const labels = Array.isArray(raw.labels) ? raw.labels : [];
		notes.push({
			title: title || null,
			body,
			tags: labels
				.map((l) =>
					typeof (l as { name?: unknown })?.name === 'string' ? (l as { name: string }).name : ''
				)
				.filter(Boolean)
				.join(', ')
		});
	}

	return { tasks, notes, skipped };
}

/* ------------------------------------------------------------------ org */

/**
 * Org mode, which is plain text with stars.
 *
 * What a heading becomes:
 *
 * - `* TODO Buy milk` (or NEXT, WAITING) is a task; `* DONE` and
 *   `* CANCELLED` are tasks already finished. A `SCHEDULED:` or `DEADLINE:`
 *   date on the lines under it becomes the task's date; the rest of the body
 *   goes in its notes.
 * - A heading with no keyword and no body is structure, and structure is not
 *   imported. One WITH a body is writing — it becomes a note, its `:tags:`
 *   carried across.
 *
 * `#+TITLE:` names the notebook everything lands in. Nothing else from the
 * preamble is read: org files carry a person's whole configuration, and an
 * import that guessed at the rest would be wrong in interesting ways.
 */
export function parseOrg(text: string): ParseResult {
	const tasks: ImportedTask[] = [];
	const notes: ImportedNote[] = [];
	const skipped: string[] = [];

	const title = /^#\+TITLE:\s*(.+)$/im.exec(text)?.[1]?.trim();

	type Open = { keyword: string | null; heading: string; tags: string; body: string[] };
	let open: Open | null = null;

	const dateIn = (line: string): string | null =>
		/(?:SCHEDULED|DEADLINE):\s*[<[](\d{4}-\d{2}-\d{2})/.exec(line)?.[1] ?? null;

	const close = (one: Open | null) => {
		if (!one) return;
		const bodyLines = one.body.filter((l) => !/^\s*(?:SCHEDULED|DEADLINE):/.test(l));
		const body = bodyLines.join('\n').trim();
		const due = one.body.map(dateIn).find((d) => d !== null) ?? null;

		if (one.keyword) {
			tasks.push({
				title: one.heading.slice(0, MAX_TITLE_LENGTH),
				notes: body.slice(0, MAX_NOTES_LENGTH),
				done: one.keyword === 'DONE' || one.keyword === 'CANCELLED',
				dueDate: due,
				rawDate: due,
				list: null
			});
		} else if (body) {
			notes.push({ title: one.heading || null, body, tags: one.tags });
		}
		// A bare heading with nothing under it is structure, silently so — an
		// org file's outline is not a list of things somebody meant to keep.
	};

	for (const raw of text.split('\n')) {
		const heading = /^(\*+)\s+(?:(TODO|NEXT|WAITING|DONE|CANCELLED)\s+)?(.*)$/.exec(raw);
		if (heading) {
			close(open);
			let rest = heading[3].trim();
			let tags = '';
			const tagged = /^(.*?)\s+:([\w:@%-]+):\s*$/.exec(rest);
			if (tagged) {
				rest = tagged[1].trim();
				tags = tagged[2].split(':').filter(Boolean).join(', ');
			}
			open = { keyword: heading[2] ?? null, heading: rest, tags, body: [] };
			continue;
		}
		if (/^#\+/.test(raw)) continue;
		if (open) open.body.push(raw);
	}
	close(open);

	return { tasks, notes, skipped, ...(title ? { suggestedNotebook: title } : {}) };
}

/* ------------------------------------------------------------------ into */

/**
 * Read the file, then write what it said.
 *
 * `includeDone` is off by default, and that is the important default: a Todoist
 * account of several years holds thousands of finished tasks, and importing
 * them fills the board's Done column with somebody's entire history on their
 * first day here. What is worth bringing over is what is still owed.
 */
export function importTasks(
	ctx: Ctx,
	input: { text: unknown; notebook?: unknown; includeDone?: boolean }
): ImportResult {
	const text = typeof input.text === 'string' ? input.text : '';
	if (!text.trim()) throw new ValidationError('Nothing to import — paste the file or choose one');
	if (text.length > MAX_INPUT) throw new ValidationError('That file is too big to import at once');

	const source = detectSource(text);
	if (!source) {
		throw new ValidationError(
			'That is not a Todoist CSV, a Google Tasks export, a Google Keep note or an org file.'
		);
	}

	const parsed =
		source === 'todoist'
			? parseTodoistCsv(text)
			: source === 'google-keep'
				? parseGoogleKeep(text)
				: source === 'org'
					? parseOrg(text)
					: parseGoogleTasks(text);

	const wanted = parsed.tasks.filter((t) => input.includeDone || !t.done);
	const notes = parsed.notes;
	if (wanted.length === 0 && notes.length === 0) {
		throw new ValidationError(
			parsed.tasks.length > 0
				? 'Every task in that file is already done — tick the box to bring those too.'
				: 'Nothing to import in that file.'
		);
	}
	if (wanted.length + notes.length > MAX_TASKS) {
		throw new ValidationError(
			`That is ${wanted.length + notes.length} things; ${MAX_TASKS} is the most at once.`
		);
	}

	const asked = typeof input.notebook === 'string' ? input.notebook.trim() : '';
	const title = notebookTitleFor(ctx, asked || parsed.suggestedNotebook, source, wanted);

	/*
	 * All of it or none of it.
	 *
	 * An import is somebody's list arriving once. Half of it arriving — because
	 * the four hundredth title was longer than a title may be, or the disk
	 * filled — is the worst outcome available: they cannot tell which half is
	 * missing without comparing against the app they just left, and importing
	 * again would duplicate everything that did land.
	 *
	 * So the notebook and every todo in it are one transaction. A failure leaves
	 * the account exactly as it was, and the error says which row broke.
	 *
	 * `createNotebook` and `createTodo` write through `db` rather than through the
	 * `tx` handle, and that is fine here rather than lucky: better-sqlite3 is
	 * synchronous and drizzle runs BEGIN on the same connection, so every
	 * statement either of them issues inside this callback is inside the
	 * transaction. The test below proves it by making one fail on purpose.
	 */
	let datesDropped = 0;
	db.transaction(() => {
		const notebookId = createNotebook(ctx, {
			title,
			description: `Imported from ${SOURCE_NAMES[source]}.`
		});

		for (const task of wanted) {
			// It said something about when, and it was not a date we read.
			if (task.dueDate === null && task.rawDate) datesDropped += 1;
			createTodo(ctx, {
				title: task.title,
				notes: task.list
					? [task.notes, `From “${task.list}”.`].filter(Boolean).join('\n\n')
					: task.notes,
				notebookId,
				scheduledDate: task.dueDate ?? undefined,
				status: task.done ? 'done' : 'todo'
			});
		}
		// The writing, beside the tasks in the same notebook — a Keep text note
		// is a note here too, with its title as a heading and its labels as tags.
		for (const note of notes) {
			createEntry(ctx, {
				content: (note.title ? `# ${note.title}\n\n${note.body}` : note.body).slice(
					0,
					MAX_ENTRY_LENGTH
				),
				tags: note.tags,
				notebookId
			});
		}
	});

	return {
		imported: wanted.length + notes.length,
		importedTasks: wanted.length,
		importedNotes: notes.length,
		notebook: title,
		skipped: parsed.skipped,
		datesDropped
	};
}

function notebookTitleFor(
	ctx: Ctx,
	asked: unknown,
	source: ImportSource,
	tasks: ImportedTask[]
): string {
	const given = typeof asked === 'string' ? asked.trim() : '';
	// Google names its lists; a Todoist CSV does not say which project it is.
	const fromFile = tasks.find((t) => t.list)?.list ?? '';
	return freeNotebookTitle(ctx, given || fromFile, SOURCE_NAMES[source]);
}

/**
 * A name that does not collide, because a second import must not fail.
 *
 * `createNotebook` refuses a duplicate title, which is right when a person
 * types one and wrong here: importing two Todoist projects in a row would
 * refuse the second with a message about notebooks. So the date is added, and
 * then a number, until it is free.
 *
 * Shared with the vault importer, which has the same problem for the same
 * reason — somebody bringing two vaults in must not meet an error about
 * notebook titles.
 */
export function freeNotebookTitle(ctx: Ctx, asked: unknown, fallback: string): string {
	const given = typeof asked === 'string' ? asked.trim() : '';
	const base = (given || fallback).slice(0, MAX_TITLE_LENGTH - 12);

	if (!taken(ctx, base)) return base;

	const dated = `${base} (${new Date(ctx.now).toISOString().slice(0, 10)})`;
	if (!taken(ctx, dated)) return dated;

	for (let n = 2; n < 100; n++) {
		const numbered = `${dated} ${n}`;
		if (!taken(ctx, numbered)) return numbered;
	}
	throw new ValidationError('Too many imports by that name — give this one a name of its own');
}

function taken(ctx: Ctx, title: string): boolean {
	return (
		db
			.select({ id: notebooks.id })
			.from(notebooks)
			.where(and(eq(notebooks.userId, ctx.userId), eq(notebooks.title, title)))
			.get() !== undefined
	);
}
