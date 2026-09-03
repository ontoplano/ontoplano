import { db } from '../db/index.js';
import type { Ctx } from './ctx.js';
import { ValidationError } from './errors.js';
import { createNotebook } from './notebooks.js';
import { createEntry, MAX_ENTRY_LENGTH } from './diary.js';
import { MAX_TITLE_LENGTH } from './todos.js';
import { freeNotebookTitle } from './imports.js';

/**
 * A vault of markdown becomes notebook entries.
 *
 * The other importers take a list and make todos, because a list is what
 * Todoist and Google Tasks hold. A vault is not a list — it is writing — so it
 * lands where writing lands: entries, in one notebook, keeping their text.
 *
 * An import and not a plugin, which is the whole decision here. A plugin is a
 * thing to keep working forever against somebody else's release cycle, and it
 * would have to hold a folder open on a machine this app is not running on. An
 * import is a button somebody presses once, and Obsidian's format is plain
 * files in a folder — the one thing about it that cannot break.
 *
 * ## What comes across
 *
 * **The text, as written.** Obsidian's markdown is markdown, and entries are
 * markdown. `[[wikilinks]]` are left exactly as they are: they are not links
 * here, but they are what somebody typed, and rewriting them would be guessing
 * at which note was meant across a hundred files.
 *
 * **The tags**, from `#tag` in the body and from a `tags:` line in the
 * frontmatter. Tags are the one piece of structure both apps genuinely share.
 *
 * **The title**, from the first heading if the file opens with one, and from
 * the filename otherwise — which is what Obsidian itself displays.
 *
 * **The folder**, as a tag. A vault's folders carry meaning, and a notebook per
 * folder would make one import into thirty notebooks, which is the opposite of
 * the undo the other importers are careful to preserve.
 *
 * ## What does not
 *
 * Attachments, canvases, plugin data, and the frontmatter beyond tags and a
 * date. Those are Obsidian's, not markdown's, and inventing a home for them
 * here would be inventing a claim to understand them.
 */

/** One file out of the vault, as the browser read it. */
export type VaultFile = { path: string; text: string };

export type VaultImportResult = {
	imported: number;
	notebook: string;
	/** Files understood well enough to know they were being dropped. */
	skipped: string[];
	tags: number;
};

/** A vault of this size is somebody's whole life, and it needs a conversation. */
const MAX_FILES = 2000;
const MAX_TOTAL = 8_000_000;

export type VaultNote = {
	title: string;
	body: string;
	tags: string[];
};

/**
 * The frontmatter block, if the file opens with one.
 *
 * Not a YAML parser: a full one is a dependency, and the two keys worth reading
 * — `tags` and a date — are both flat. Anything else in there is left in the
 * body's dust rather than half-understood.
 */
function splitFrontmatter(text: string): { front: string; body: string } {
	if (!text.startsWith('---')) return { front: '', body: text };
	const end = text.indexOf('\n---', 3);
	if (end === -1) return { front: '', body: text };
	const after = text.indexOf('\n', end + 1);
	return {
		front: text.slice(3, end),
		body: after === -1 ? '' : text.slice(after + 1)
	};
}

/** `tags: [a, b]`, `tags: a b`, and the `- a` list form under `tags:`. */
function frontmatterTags(front: string): string[] {
	const lines = front.split('\n');
	const index = lines.findIndex((l) => /^tags\s*:/i.test(l.trim()));
	if (index === -1) return [];

	const inline = lines[index].replace(/^\s*tags\s*:/i, '').trim();
	const found: string[] = [];

	if (inline) {
		found.push(...inline.replace(/^\[|\]$/g, '').split(/[,\s]+/));
	}

	// The list form: `tags:` on its own line, then `  - one` under it.
	for (let i = index + 1; i < lines.length; i++) {
		const item = /^\s*-\s+(.*)$/.exec(lines[i]);
		if (!item) break;
		found.push(item[1]);
	}

	return found;
}

/** `#tag` in the body, but not a `# heading` and not a `#` inside a word. */
function bodyTags(body: string): string[] {
	const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
	return [...withoutCode.matchAll(/(?:^|[\s(])#([a-z0-9][\w/-]*)/gi)].map((m) => m[1]);
}

/** `Notes/Books/Republic.md` → `Republic`, and the folders that held it. */
function pathParts(path: string): { name: string; folders: string[] } {
	const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
	const segments = clean.split('/').filter(Boolean);
	const file = segments.pop() ?? clean;
	return { name: file.replace(/\.md$/i, ''), folders: segments };
}

/**
 * One file, read.
 *
 * Answers null for a file with nothing in it but its frontmatter — an empty
 * note is Obsidian's scratch, and importing a hundred of them is the fastest
 * way to make somebody regret pressing the button.
 */
export function parseVaultNote(file: VaultFile): VaultNote | null {
	const { front, body } = splitFrontmatter(file.text);
	const trimmed = body.trim();
	if (!trimmed) return null;

	const { name, folders } = pathParts(file.path);

	// The first heading, when the file opens with one — which is what Obsidian
	// shows in preview, so it is the title somebody recognises.
	const heading = /^#{1,6}\s+(.+?)\s*$/m.exec(trimmed.split('\n')[0] ?? '');
	const title = (heading ? heading[1] : name).slice(0, MAX_TITLE_LENGTH).trim() || name;

	const tags = [...new Set([...frontmatterTags(front), ...bodyTags(trimmed), ...folders])]
		.map((t) => t.trim().replace(/^#/, ''))
		.filter((t) => t.length > 0 && t.length <= 40);

	return { title, body: trimmed.slice(0, MAX_ENTRY_LENGTH), tags };
}

/**
 * Bring a vault in. All of it or none of it, like every other import.
 *
 * Half a vault arriving is the worst outcome available: nobody can tell which
 * half is missing without comparing against the app they just left, and
 * pressing the button again would duplicate whatever did land.
 */
export function importVault(
	ctx: Ctx,
	input: { files: VaultFile[]; notebook?: unknown }
): VaultImportResult {
	const files = input.files.filter((f) => /\.md$/i.test(f.path));

	if (files.length === 0)
		throw new ValidationError('No markdown files in that — choose the .md files from the vault.');
	if (files.length > MAX_FILES) {
		throw new ValidationError(`That is ${files.length} notes; ${MAX_FILES} is the most at once.`);
	}

	const total = files.reduce((sum, f) => sum + f.text.length, 0);
	if (total > MAX_TOTAL) throw new ValidationError('That vault is too big to bring in at once.');

	const skipped: string[] = [];
	const notes: VaultNote[] = [];

	for (const file of files) {
		const note = parseVaultNote(file);
		if (note) notes.push(note);
		else skipped.push(`${file.path} — empty`);
	}

	if (notes.length === 0) throw new ValidationError('Every note in that vault is empty.');

	const title = freeNotebookTitle(ctx, input.notebook, 'Obsidian');
	const seen = new Set<string>();

	db.transaction(() => {
		const notebookId = createNotebook(ctx, {
			title,
			description: 'Imported from an Obsidian vault.'
		});

		for (const note of notes) {
			for (const tag of note.tags) seen.add(tag);
			// The title goes on the entry as its first line rather than into a
			// field of its own, because an entry has no title field — it is a
			// piece of writing, and the first line is what the list shows.
			const content = note.body.startsWith('#')
				? note.body
				: `# ${note.title}\n\n${note.body}`.slice(0, MAX_ENTRY_LENGTH);

			createEntry(ctx, { content, notebookId, tags: note.tags.join(' ') });
		}
	});

	return { imported: notes.length, notebook: title, skipped, tags: seen.size };
}
