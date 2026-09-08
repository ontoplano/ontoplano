import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

/**
 * An Obsidian vault, arriving.
 *
 * The interesting cases are all about what a vault has that a task list does
 * not: frontmatter in three different shapes, folders that mean something,
 * `#tags` that must not be confused with `# headings`, and notes that are
 * empty because Obsidian creates one every time somebody presses the wrong key.
 */

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let vault: typeof import('../src/lib/server/services/import-vault');
let diary: typeof import('../src/lib/server/services/diary');

/** `listEntries` is the loose pile; an import lands in a notebook. */
const entryCount = () =>
	(database.get('select count(*) as n from diary_entries') as { n: number }).n;
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	vault = await import('../src/lib/server/services/import-vault');
	diary = await import('../src/lib/server/services/diary');
	ctx = { userId: OWNER, now: new Date('2026-09-03T12:00:00'), tz: 'UTC' };
});

beforeEach(() => {
	for (const table of ['diary_entry_tags', 'diary_entries', 'tags', 'notebooks']) {
		database.exec(`delete from ${table}`);
	}
});

const note = (path: string, text: string) => ({ path, text });

describe('reading one note', () => {
	test('the first heading is the title, when the file opens with one', () => {
		const out = vault.parseVaultNote(note('Republic.md', '# On the Republic\n\nBook one.'));
		expect(out?.title).toBe('On the Republic');
	});

	test('and the filename is, when it does not', () => {
		const out = vault.parseVaultNote(note('Notes/Reading list.md', 'Plato, then Aristotle.'));
		expect(out?.title).toBe('Reading list');
	});

	test('the folders it was in become tags', () => {
		const out = vault.parseVaultNote(note('Books/Philosophy/Republic.md', 'Book one.'));
		expect(out?.tags).toContain('Books');
		expect(out?.tags).toContain('Philosophy');
	});

	test('#tags in the body come across, and # headings do not', () => {
		const out = vault.parseVaultNote(
			note('a.md', '# A heading\n\nSomething about #philosophy and #reading-list.')
		);
		expect(out?.tags).toContain('philosophy');
		expect(out?.tags).toContain('reading-list');
		// The heading is a heading. It was the first thing this got wrong.
		expect(out?.tags).not.toContain('A');
	});

	test('a # inside a code fence is code', () => {
		const out = vault.parseVaultNote(note('a.md', 'Text.\n\n```sh\n# not a tag\n```\n'));
		expect(out?.tags).toEqual([]);
	});

	test('frontmatter tags, in all three shapes Obsidian writes', () => {
		const inline = vault.parseVaultNote(note('a.md', '---\ntags: [one, two]\n---\nBody.'));
		expect(inline?.tags).toEqual(expect.arrayContaining(['one', 'two']));

		const spaced = vault.parseVaultNote(note('b.md', '---\ntags: one two\n---\nBody.'));
		expect(spaced?.tags).toEqual(expect.arrayContaining(['one', 'two']));

		const listed = vault.parseVaultNote(note('c.md', '---\ntags:\n  - one\n  - two\n---\nBody.'));
		expect(listed?.tags).toEqual(expect.arrayContaining(['one', 'two']));
	});

	test('frontmatter is not part of the body', () => {
		const out = vault.parseVaultNote(note('a.md', '---\ntags: one\nauthor: me\n---\nJust this.'));
		expect(out?.body).toBe('Just this.');
		expect(out?.body).not.toContain('author');
	});

	test('a note with nothing in it is nothing', () => {
		expect(vault.parseVaultNote(note('empty.md', ''))).toBeNull();
		expect(vault.parseVaultNote(note('front.md', '---\ntags: one\n---\n\n  \n'))).toBeNull();
	});

	test('wikilinks are left exactly as they were written', () => {
		const out = vault.parseVaultNote(note('a.md', 'See [[The Republic]] and [[Ethics|that one]].'));
		expect(out?.body).toContain('[[The Republic]]');
		expect(out?.body).toContain('[[Ethics|that one]]');
	});
});

describe('bringing a vault in', () => {
	const aVault = () => [
		note('Books/Republic.md', '# The Republic\n\nBook one. #philosophy'),
		note('Books/Ethics.md', '---\ntags: [aristotle]\n---\nOn virtue.'),
		note('Trips/Lisbon.md', 'Three days. #travel'),
		note('scratch.md', ''),
		note('attachment.png', 'not markdown')
	];

	test('one notebook, one entry per note', () => {
		const result = vault.importVault(ctx, { files: aVault() });

		expect(result.imported).toBe(3);
		expect(result.notebook).toBe('Obsidian');
		expect(entryCount()).toBe(3);
		// The empty one is reported rather than silently dropped; the png was
		// never a candidate.
		expect(result.skipped.join(' ')).toContain('scratch.md');
	});

	test('the tags arrive with them', () => {
		vault.importVault(ctx, { files: aVault() });

		// Lower-cased on the way in, as every tag in the app is.
		const names = diary.listTags(ctx).map((t: { name: string }) => t.name);
		expect(names).toEqual(expect.arrayContaining(['philosophy', 'aristotle', 'travel', 'books']));
	});

	test('a second vault does not collide with the first', () => {
		expect(vault.importVault(ctx, { files: aVault() }).notebook).toBe('Obsidian');
		// A duplicate notebook title is refused by `createNotebook`, which is
		// right when a person types one and wrong here.
		expect(vault.importVault(ctx, { files: aVault() }).notebook).toBe('Obsidian (2026-09-03)');
	});

	test('a named notebook is used', () => {
		expect(vault.importVault(ctx, { files: aVault(), notebook: 'My vault' }).notebook).toBe(
			'My vault'
		);
	});

	test('nothing markdown in it is refused, and nothing is written', () => {
		expect(() => vault.importVault(ctx, { files: [note('a.png', 'x')] })).toThrow(/markdown/i);
		expect(entryCount()).toBe(0);
	});

	test('a vault of empty notes is refused, and nothing is written', () => {
		expect(() => vault.importVault(ctx, { files: [note('a.md', '  \n')] })).toThrow(/empty/i);
		expect(entryCount()).toBe(0);
	});

	/**
	 * Half a vault is the worst outcome available: nobody can tell which half is
	 * missing without comparing against the app they just left, and pressing the
	 * button again would duplicate whatever did land.
	 */
	test('a note that will not save takes the whole import with it', () => {
		// Past the instance's per-entry picture ceiling, which is the one way an
		// entry is refused after everything above it has already been written.
		const tooMany = Array.from({ length: 40 }, (_, i) => `![](/media/${i + 1})`).join('\n');

		expect(() =>
			vault.importVault(ctx, {
				files: [note('fine.md', 'Fine.'), note('pictures.md', tooMany)]
			})
		).toThrow();

		expect(entryCount()).toBe(0);
		expect(database.get('select count(*) as n from notebooks')).toEqual({ n: 0 });
	});
});

/**
 * A `.md` name does not make something markdown.
 *
 * Markdown has no signature — every text file is valid markdown — so the only
 * meaningful version of "check it really is one" is "check it really is text".
 * A renamed binary was never a security problem here (everything is escaped
 * before it is rendered, and `$lib/markdown.ts` emits only tags it writes
 * itself), but it is a hundred notes of mojibake somebody deletes by hand.
 */
describe('a file that is not text', () => {
	const nul = String.fromCharCode(0);
	const replacement = String.fromCharCode(0xfffd);

	test('a NUL byte is enough to know', () => {
		expect(vault.looksLikeText('# Fine\n\ntext')).toBe(true);
		expect(vault.looksLikeText(`PK${nul}${nul}stuff`)).toBe(false);
	});

	test('so is a page of replacement characters', () => {
		// What the browser leaves where it could not decode a byte as UTF-8.
		expect(vault.looksLikeText(replacement.repeat(200))).toBe(false);
	});

	test('but one of them is somebody pasting one', () => {
		expect(vault.looksLikeText(`a note about ${replacement}${'x'.repeat(500)}`)).toBe(true);
	});

	test('an empty file is text, and is dropped later for being empty', () => {
		expect(vault.looksLikeText('')).toBe(true);
	});

	test('it is skipped by name rather than imported as rubbish', () => {
		const result = vault.importVault(ctx, {
			files: [
				{ path: 'Notes/real.md', text: '# Real\n\nsomething' },
				{ path: 'Notes/photo.md', text: `${nul}binary` }
			],
			notebook: 'Mixed'
		});

		expect(result.imported).toBe(1);
		expect(result.skipped.some((s) => s.includes('photo.md') && s.includes('not text'))).toBe(true);
	});

	test('and a vault of nothing but binaries is refused, saying why', () => {
		expect(() =>
			vault.importVault(ctx, {
				files: [{ path: 'a.md', text: `${nul}${nul}` }],
				notebook: 'None'
			})
		).toThrow(/does not make something markdown/);
	});
});
