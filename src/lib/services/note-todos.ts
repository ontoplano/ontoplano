import { checklistItems } from '$lib/checklist.js';
import type { Ctx } from './ctx.js';
import { getEntry } from './diary.js';
import { createTodo, MAX_NOTES_LENGTH, MAX_TITLE_LENGTH, setTodoStatus } from './todos.js';

/**
 * Turning a note that is really a checklist into the todos it describes.
 *
 * People write lists in notes because that is the fastest way to get one out of
 * their head, and then the list sits somewhere nothing can remind them of it.
 * This is the way across: every `- [ ]` line in the note becomes a todo, with
 * whatever is written under it as that todo's notes — see `$lib/checklist` for
 * the shape being read.
 *
 * The note is left exactly as it was. Deleting it is a separate press, because
 * somebody who meant "also put these on my list" and somebody who meant "move
 * these onto my list" both press this button, and only one of them wants the
 * note gone.
 */

/** What came of it, in the order the note had them. */
export type MadeTodos = { ids: number[]; skipped: number };

/**
 * Make todos of a note's checkboxes.
 *
 * `only` names which ones by their position in the note, counting from zero,
 * for the screen that lets somebody leave a few behind; left out means all of
 * them. A ticked box arrives ticked, so a half-done list crosses over half
 * done rather than pretending the finished half never happened.
 *
 * Each todo is filed under the note's own notebook. That is nearly always what
 * was meant — the list was written *about* something — and a todo in the wrong
 * notebook is a great deal easier to notice and move than one in none.
 */
export function makeTodosFromEntry(ctx: Ctx, entryId: number, only?: number[]): MadeTodos {
	const entry = getEntry(ctx, entryId);
	const items = checklistItems(entry.content);
	const wanted = only === undefined ? items.map((_, at) => at) : [...new Set(only)].sort(byNumber);

	const ids: number[] = [];
	let skipped = 0;

	for (const at of wanted) {
		const item = items[at];
		if (!item) {
			skipped += 1;
			continue;
		}
		const id = createTodo(ctx, {
			// A checkbox line can be a paragraph. The title takes what fits and
			// the rest goes into the notes, rather than the whole thing being
			// refused for being long.
			title: item.title.slice(0, MAX_TITLE_LENGTH),
			notes: joinNotes(item.title.slice(MAX_TITLE_LENGTH).trim(), item.notes),
			notebookId: entry.notebookId ?? undefined
		});
		if (item.done) setTodoStatus(ctx, id, 'done');
		ids.push(id);
	}

	return { ids, skipped };
}

const byNumber = (a: number, b: number) => a - b;

function joinNotes(overflow: string, notes: string): string | undefined {
	const both = [overflow, notes].filter(Boolean).join('\n\n');
	return both ? both.slice(0, MAX_NOTES_LENGTH) : undefined;
}
