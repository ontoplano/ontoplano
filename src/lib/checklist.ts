/**
 * A note that is really a list of things to do.
 *
 * People write checklists in notes — it is the fastest way to get a list out of
 * your head — and then the list sits in a notebook where nothing can remind
 * them of it, nothing can be put on a day, and nothing can be ticked off
 * anywhere that counts. The note was the right place to write it and the wrong
 * place to keep it.
 *
 * So a note with a checkbox in it can become todos. The shape is the one people
 * already write without being told:
 *
 *     - [ ] ring the plumber
 *       the boiler makes a noise after 9pm
 *       his number is on the fridge
 *     - [x] book the MOT
 *
 * A checkbox line is a title. Everything under it until the next checkbox line
 * is that todo's notes, indentation and blank lines taken off the front and
 * back but kept in the middle, because a list under a title is still a list.
 * Anything written above the first checkbox belongs to the note, not to any
 * todo, and is left where it is.
 */

/**
 * A line that is a checkbox, with what it says.
 *
 * Lenient about what people actually type: any amount of leading space, `-`,
 * `*` or `+` as the bullet, `[ ]`, `[]`, `[x]` or `[X]` as the box. Strict
 * about needing a bullet, so a bare `[ ]` in a sentence is a sentence.
 */
const CHECKBOX = /^(\s*)[-*+]\s+\[([ xX]?)\]\s*(.*)$/;

/** Markdown that would read as decoration rather than as a title. */
const DECORATION = /^\s*[#>*_`-]+\s*|\s*[*_`]+\s*$/g;

export type ChecklistItem = {
	/** The words on the checkbox line. */
	title: string;
	/** Everything under it, up to the next checkbox line. */
	notes: string;
	/** Whether the box was already ticked. */
	done: boolean;
};

/**
 * Every checkbox in a piece of writing, with what belongs to each.
 *
 * An empty list means this note is not a checklist, which is what the button
 * asks before it offers itself.
 */
export function checklistItems(content: string): ChecklistItem[] {
	const items: ChecklistItem[] = [];
	let current: { title: string; done: boolean; lines: string[] } | null = null;

	const close = () => {
		if (!current) return;
		items.push({ title: current.title, notes: trimBlank(current.lines), done: current.done });
		current = null;
	};

	for (const line of content.split('\n')) {
		const box = CHECKBOX.exec(line);
		if (box) {
			close();
			const [, , tick, said] = box;
			const title = said.replace(DECORATION, '').trim();
			// A checkbox with nothing after it is a line somebody has not
			// written yet, not a todo with no name.
			if (title) current = { title, done: tick.toLowerCase() === 'x', lines: [] };
			continue;
		}
		// Before the first checkbox: this is the note's own writing.
		if (current) current.lines.push(line);
	}
	close();
	return items;
}

/** Whether the "make todos of this" offer applies at all. */
export function isChecklist(content: string): boolean {
	return checklistItems(content).length > 0;
}

/**
 * The blank lines off the top and bottom, and the shared indent off the front.
 *
 * Notes written under a checkbox are indented to sit under it. Keeping that
 * indent would make every line of every todo's notes start with two spaces,
 * and in markdown four of them is a code block — so the *common* indent comes
 * off and the relative shape stays.
 */
function trimBlank(lines: string[]): string {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim() === '') start += 1;
	while (end > start && lines[end - 1].trim() === '') end -= 1;
	const kept = lines.slice(start, end);
	if (kept.length === 0) return '';

	const indent = Math.min(
		...kept.filter((line) => line.trim() !== '').map((line) => /^\s*/.exec(line)![0].length)
	);
	return kept.map((line) => line.slice(indent)).join('\n');
}

/**
 * The note rewritten to point at the tasks it just became.
 *
 * Each checkbox line that crossed over is replaced by a reference — `TASK:#4`,
 * the task's number inside this notebook — and the writing under it is left
 * exactly where it was, because that writing is now on the task *and* still
 * explains the line in the note.
 *
 * Why rewrite at all: the offer to make todos of a checklist is drawn wherever
 * a `- [ ]` is, and after making them the boxes were still boxes, so the
 * button stood there offering to do it again and there were two records of the
 * same list drifting apart. A reference is one record, said in both places.
 *
 * `made` is keyed by the position of the checkbox in the note, which is what
 * `makeTodosFromEntry` counts by — one that was left behind keeps its box.
 */
export function withTodoReferences(content: string, made: Map<number, number>): string {
	const out: string[] = [];
	let at = -1;

	for (const line of content.split('\n')) {
		const box = CHECKBOX.exec(line);
		if (!box) {
			out.push(line);
			continue;
		}
		const [, indent, , said] = box;
		// Counted the same way `checklistItems` counts: a box with nothing
		// after it is not a todo and does not take a number.
		if (!said.replace(DECORATION, '').trim()) {
			out.push(line);
			continue;
		}
		at += 1;
		const seq = made.get(at);
		out.push(seq === undefined ? line : `${indent}- TASK:#${seq}`);
	}

	return out.join('\n');
}
