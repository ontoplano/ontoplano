/**
 * The export, put back.
 *
 * An export that cannot be imported is a souvenir, not a way out — the promise
 * on the front page is that you can walk away with your data, and walking away
 * with it means arriving somewhere else with it.
 *
 * The case that matters is the ids. Every app table has an autoincrement
 * primary key and the rows point at each other with it, so id 7 in the file is
 * somebody else's row in the database being imported into. The rows have to be
 * renumbered on the way in and every reference rewritten to match, or a week
 * comes back attached to the wrong things — which looks like it worked.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { messages as english } from '../src/lib/i18n/catalogues/en';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { refusal, refusalOf } from './helpers/refusal';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let account: typeof import('../src/lib/server/services/account');
let accountImport: typeof import('../src/lib/server/services/account-import');
let activities: typeof import('../src/lib/services/activities');
let todos: typeof import('../src/lib/services/todos');
let inventory: typeof import('../src/lib/services/inventory');
let ctx: typeof import('../src/lib/services/ctx');
let ideasService: typeof import('../src/lib/services/ideas');

const now = new Date('2026-09-01T09:00:00Z');

beforeAll(async () => {
	account = await import('../src/lib/server/services/account');
	accountImport = await import('../src/lib/server/services/account-import');
	activities = await import('../src/lib/services/activities');
	todos = await import('../src/lib/services/todos');
	inventory = await import('../src/lib/services/inventory');
	ctx = await import('../src/lib/services/ctx');
	ideasService = await import('../src/lib/services/ideas');
});

const owner = () => ctx.buildCtx(OWNER);
const stranger = () => ctx.buildCtx(STRANGER);

describe('a round trip', () => {
	let file: ReturnType<typeof account.exportAccount>;

	beforeAll(() => {
		// A category, an activity that points at it, and a todo that points at
		// the category: three tables and two references between them, which is
		// the whole of what the renumbering has to get right.
		const cat = activities.createCategory(owner(), { name: 'garden', color: '#0f766e' });
		activities.createActivity(owner(), { name: 'weeding', categoryId: cat });
		todos.createTodo(owner(), { title: 'buy compost', categoryId: cat });

		const list = inventory.createCategory(owner(), { name: 'outdoors' });
		inventory.createItem(owner(), { name: 'twine', inventoryCategoryId: list, type: 'replenish' });

		file = account.exportAccount(OWNER, now);
	});

	test('lands everything in the other account', async () => {
		const result = await accountImport.importAccount(STRANGER, file);

		expect(result.total).toBeGreaterThan(0);
		expect(activities.listCategories(stranger()).map((c) => c.name)).toContain('garden');
		expect(todos.listUnscheduled(stranger()).map((t) => t.title)).toContain('buy compost');
	});

	test('and the references point at the imported rows, not the old ids', async () => {
		// The failure this catches: keeping the old number. It would still be a
		// valid id — somebody else's — so nothing errors and the activity comes
		// back under the wrong category.
		const cats = activities.listCategories(stranger());
		const garden = cats.find((c) => c.name === 'garden');
		expect(garden).toBeTruthy();

		const weeding = activities.listActivities(stranger()).find((a) => a.name === 'weeding');
		expect(weeding?.categoryId).toBe(garden!.id);

		const compost = todos.listUnscheduled(stranger()).find((t) => t.title === 'buy compost');
		expect(compost?.categoryId).toBe(garden!.id);
	});

	test('every row belongs to the account that imported it', async () => {
		// The one mistake that would be a security bug rather than a nuisance.
		const theirs = account.exportAccount(STRANGER, new Date(now.getTime() + 1000));
		for (const rows of Object.values(theirs.data)) {
			for (const row of rows as Record<string, unknown>[]) {
				if ('userId' in row) expect(row.userId).toBe(STRANGER);
			}
		}
	});

	test('replaces rather than merges: importing twice is not two copies', async () => {
		await accountImport.importAccount(STRANGER, file);
		const gardens = activities.listCategories(stranger()).filter((c) => c.name === 'garden');
		expect(gardens).toHaveLength(1);
	});

	test('and the account it came from still has everything', async () => {
		expect(activities.listCategories(owner()).map((c) => c.name)).toContain('garden');
	});
});

describe('what does not travel', () => {
	test('billing is dropped, and said so', async () => {
		const file = {
			exportedAt: now.toISOString(),
			account: { id: 'x', name: 'x', email: 'someone@example.test' },
			data: {
				subscriptions: [{ id: 1, userId: 'x', plan: 'pro', status: 'active', provider: 'paddle' }],
				apiTokens: [{ id: 1, userId: 'x', name: 'a token', tokenHash: 'deadbeef' }]
			}
		};

		const result = await accountImport.importAccount(STRANGER, file);
		const names = result.skipped.map((s) => s.name);
		expect(names).toContain('subscriptions');
		expect(names).toContain('apiTokens');
		// And every skip says why, because "some things were skipped" is not an
		// answer somebody can act on.
		for (const skip of result.skipped) expect(skip.why.length).toBeGreaterThan(10);
	});

	/**
	 * Not carrying a row in is not the same as carrying it out.
	 *
	 * The import emptied every table and then declined to refill the ones
	 * `NOT_PORTABLE` names — so restoring a backup *deleted* the rows that
	 * belong to this instance rather than to the file. On a real instance that
	 * meant a paying account was asked to pay again on the next page load, its
	 * API tokens had silently stopped working, and the calendar link handed to
	 * a phone had gone. Nothing said any of it had happened.
	 *
	 * The rule was always right and only half-applied.
	 */
	test('leaves this instance’s own rows exactly where they were', async () => {
		const { db } = await import('../src/lib/server/db/index');
		const schema = await import('../src/lib/db/schema');

		// A subscription and a token, as this instance issued them.
		db.insert(schema.subscriptions)
			.values({
				userId: OWNER,
				provider: 'paddle',
				providerSubscriptionId: 'sub_local',
				plan: 'pro',
				status: 'active',
				createdAt: now.toISOString(),
				updatedAt: now.toISOString()
			})
			.run();
		db.insert(schema.apiTokens)
			.values({
				userId: OWNER,
				name: 'the phone',
				tokenHash: 'a'.repeat(64),
				prefix: 'onto_aaaaaa',
				scopes: 'today:read',
				createdAt: now.toISOString(),
				updatedAt: now.toISOString()
			})
			.run();

		// A perfectly ordinary export from somewhere else, carrying neither.
		await accountImport.importAccount(OWNER, {
			exportedAt: now.toISOString(),
			account: { id: 'elsewhere', name: 'Elsewhere', email: 'elsewhere@example.test' },
			data: { todoTasks: [{ id: 1, userId: 'elsewhere', title: 'from the file' }] }
		});

		const subscriptions = db.select().from(schema.subscriptions).all();
		const tokens = db.select().from(schema.apiTokens).all();

		expect(
			subscriptions.filter((r) => r.userId === OWNER),
			'an import must not take the subscription with it'
		).toHaveLength(1);
		expect(
			tokens.filter((r) => r.userId === OWNER),
			'an import must not take the API tokens with it'
		).toHaveLength(1);
		// And the file's own rows did arrive.
		expect(todos.listTodos(owner()).some((t) => t.title === 'from the file')).toBe(true);
	});

	/**
	 * And there is a way back from a restore that was the wrong file.
	 *
	 * An import empties the account and refills it in one transaction, so
	 * without this there is nothing to return to — the deploy's snapshot is the
	 * instance's, not the person's.
	 */
	test('writes the account to disk before replacing it, and says where', async () => {
		const { readFileSync } = await import('node:fs');
		const audit = await import('../src/lib/services/audit');

		todos.createTodo(owner(), { title: 'about to be destroyed' });

		await accountImport.importAccount(OWNER, {
			exportedAt: now.toISOString(),
			account: { id: 'elsewhere', name: 'Elsewhere', email: 'elsewhere@example.test' },
			data: { todoTasks: [{ id: 1, userId: 'elsewhere', title: 'the replacement' }] }
		});

		const entry = audit
			.listForSubject(OWNER, 20)
			.find((e: { event: string }) => e.event === 'data_imported');
		expect(entry, 'an import is a thing that happened to an account').toBeTruthy();

		const rescue = (entry!.detail as { rescue?: string }).rescue;
		expect(rescue, 'the log line names the copy').toBeTruthy();

		const kept = JSON.parse(readFileSync(rescue!, 'utf8'));
		expect(
			(kept.data.todoTasks as { title: string }[]).some((t) => t.title === 'about to be destroyed'),
			'the copy holds what the import was about to delete'
		).toBe(true);
	});

	/*
	 * A file older than the rule the database now holds.
	 *
	 * A habit's day is one row since 0.183.3; an export taken before that can
	 * carry the same day twice, and the whole restore used to fail on it. The
	 * duplicate is dropped and named, which is the same bargain the rest of the
	 * skipped rows get.
	 */
	test('a day logged twice in an old file costs the file nothing but that day', async () => {
		const result = await accountImport.importAccount(STRANGER, {
			exportedAt: now.toISOString(),
			account: { id: 'x', name: 'x', email: 'a@b.test' },
			data: {
				habits: [{ id: 7, userId: 'x', name: 'swim', type: 'good' }],
				habitOccurrences: [
					{ id: 1, userId: 'x', habitId: 7, date: '2026-08-17', notes: 'twice' },
					{ id: 2, userId: 'x', habitId: 7, date: '2026-08-17', notes: '' }
				]
			}
		});

		const doubled = result.skipped.find((s) => s.name === 'habitOccurrences');
		expect(doubled?.rows, 'the second copy of the day was dropped').toBe(1);
		expect(english[doubled!.why]).toMatch(/already logged/i);
		expect(result.tables.find((c) => c.name === 'habits')?.rows).toBe(1);
	});

	test('a table this version has never heard of is reported, not refused', async () => {
		const result = await accountImport.importAccount(STRANGER, {
			exportedAt: now.toISOString(),
			account: { id: 'x', name: 'x', email: 'a@b.test' },
			data: { beliefs: [{ id: 1, userId: 'x' }] }
		});

		const beliefs = result.skipped.find((s) => s.name === 'beliefs');
		expect(english[beliefs!.why]).toMatch(/no such table/);
	});
});

describe('a file that is not an export', () => {
	test('is refused with a sentence, not a stack trace', async () => {
		expect(refusal(() => accountImport.parseExport('not json at all {'))).toMatch(/not JSON/i);
		expect(refusal(() => accountImport.parseExport('[]'))).toMatch(/not an ontoplano export/i);
		expect(refusal(() => accountImport.parseExport('{}'))).toMatch(/no account data/i);
		expect(refusal(() => accountImport.parseExport('{"data":{"todoTasks":"nope"}}'))).toMatch(
			/not a list of rows/i
		);
	});

	/**
	 * A file somebody made rather than exported.
	 *
	 * This is the one screen where a stranger's file is read by the server, so
	 * the ceilings are the interesting part: not what a real export contains,
	 * but what a made-up one is stopped from costing.
	 */
	test("is refused when it is too big to be anybody's data", async () => {
		const huge = `{"data":{"todoTasks":[${'{},'.repeat(200_001).slice(0, -1)}]}}`;
		expect(refusal(() => accountImport.parseExport(huge))).toMatch(/most one restore may carry/i);

		expect(refusal(() => accountImport.parseExport('x'.repeat(20_000_001)))).toMatch(/too big/i);
	});

	test('drops a value no column can hold rather than failing mid-restore', async () => {
		const before = todos.listUnscheduled(stranger()).length;

		await accountImport.importAccount(STRANGER, {
			exportedAt: '2026-09-01',
			account: { id: OWNER, name: 'x', email: 'x@test.invalid' },
			data: {
				notebooks: [{ id: 1, title: 'Kept', description: { nested: 'not a column value' } }],
				todoTasks: [
					{ id: 1, title: 'A'.repeat(400_000), notebookId: 1, status: 'todo' },
					{ id: 2, title: 'Fine', notebookId: 1, status: 'todo', notes: ['also', 'not'] }
				]
			}
		});

		const after = todos.listUnscheduled(stranger());
		expect(after.length).toBeGreaterThan(before);
		// The long one landed, cut to a length a column can hold, rather than
		// taking the whole transaction down with it.
		expect(after.some((t) => t.title.startsWith('AAAA'))).toBe(true);
		expect(after.some((t) => t.title === 'Fine')).toBe(true);
	});
});

/**
 * The rows that are later served back as raw bytes under their stored type.
 *
 * The upload paths derive the type on the server — a picture from its first
 * bytes, a sound from a short allowlist — so the import has to do the same,
 * or a crafted file stores a `text/html` "picture" that `/media/[id]` then
 * serves as a same-origin document: stored XSS with the victim's own session.
 */
describe('a file cannot lie about the type of its bytes', () => {
	const PNG = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		Buffer.from('not really a picture body, but the signature is what decides')
	]);

	const withMedia = (row: Record<string, unknown>) => ({
		exportedAt: now.toISOString(),
		account: { id: 'x', name: 'x', email: 'someone@example.test' },
		data: { media: [{ id: 1, userId: 'x', byteSize: 1, sha256: 'lied', ...row }] }
	});

	test('an HTML "picture" is refused, whole import and all', async () => {
		const doc = Buffer.from('<script>fetch("/api/v1/export")</script>');
		expect(
			await refusalOf(() =>
				accountImport.importAccount(STRANGER, {
					exportedAt: now.toISOString(),
					account: { id: 'x', name: 'x', email: 'someone@example.test' },
					data: {
						media: [
							{
								id: 1,
								userId: 'x',
								mime: 'text/html',
								filename: 'photo.html',
								byteSize: doc.length,
								sha256: 'x',
								bytes: doc.toString('base64')
							}
						]
					}
				})
			)
		).toMatch(/not a format this app accepts/);
	});

	test('a real picture claiming a document type is stored under what its bytes say', async () => {
		await accountImport.importAccount(
			STRANGER,
			withMedia({ mime: 'text/html', filename: 'photo.html', bytes: PNG.toString('base64') })
		);

		const back = account.exportAccount(STRANGER, new Date(now.getTime() + 5000));
		const rows = back.data.media as { mime: string; sha256: string; byteSize: number }[];
		expect(rows).toHaveLength(1);
		expect(rows[0].mime).toBe('image/png');
		// And the columns derived from the bytes are recomputed, not copied.
		expect(rows[0].byteSize).toBe(PNG.length);
		expect(rows[0].sha256).not.toBe('lied');
	});

	test('a "sound" with a document type is refused the same way', async () => {
		expect(
			await refusalOf(() =>
				accountImport.importAccount(STRANGER, {
					exportedAt: now.toISOString(),
					account: { id: 'x', name: 'x', email: 'someone@example.test' },
					data: {
						ringtones: [
							{
								id: 1,
								userId: 'x',
								name: 'chime',
								mime: 'text/html',
								bytes: 4,
								data: Buffer.from('<h1>hi</h1>').toString('base64')
							}
						]
					}
				})
			)
		).toMatch(/not a format this app accepts/);
	});
});

/**
 * The preview: everything the import would decide, decided with nothing written.
 *
 * A restore empties the account first, so the moment to learn that the file
 * carries a picture the import will refuse is before agreeing to that — not
 * three seconds into a transaction that rolls back with one sentence. And
 * somebody who has read that list gets a way through: drop exactly those rows
 * and bring in the rest, which is what `dropUnacceptable` is.
 */
describe('the preview, and the way through it offers', () => {
	const PNG = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		Buffer.from('the signature is what decides')
	]);
	const DOC = Buffer.from('<script>fetch("/api/v1/export")</script>');

	const media = (id: number, bytes: Buffer) => ({
		id,
		userId: 'x',
		mime: 'image/png',
		filename: `p${id}.png`,
		byteSize: bytes.length,
		sha256: 'x',
		bytes: bytes.toString('base64')
	});

	const file = {
		exportedAt: now.toISOString(),
		account: { id: 'x', name: 'x', email: 'mover@example.test' },
		data: {
			media: [media(1, PNG), media(2, DOC)],
			apiTokens: [{ id: 1, userId: 'x', name: 'old', hash: 'x', scopes: '' }],
			ideas: [{ id: 1, userId: 'x', content: 'the one idea' }]
		}
	};

	test('says whose file it is, what lands, what is left and what would be refused', async () => {
		const seen = accountImport.previewImport(file);

		expect(seen.from).toEqual({ email: 'mover@example.test', exportedAt: now.toISOString() });
		expect(seen.tables).toContainEqual({ name: 'ideas', rows: 1 });
		/*
		 * `why` is a message key now, and the catalogue holds the sentence. Both
		 * halves are checked: the preview names the right reason, and the reason
		 * still says what it always said.
		 */
		const skipped = seen.skipped.find((row) => row.name === 'apiTokens');
		expect(skipped?.rows).toBe(1);
		expect(english[skipped!.why]).toContain('secret');

		expect(seen.unacceptable).toHaveLength(1);
		expect(seen.unacceptable[0].name).toBe('media');
		expect(seen.unacceptable[0].rows).toBe(1);
		expect(english[seen.unacceptable[0].why]).toContain('not a picture format');
	});

	test('writes nothing at all', async () => {
		// Read through the services, the way every other case here does.
		const before = ideasService.listIdeas(ctx.buildCtx(STRANGER)).length;
		accountImport.previewImport(file);
		expect(ideasService.listIdeas(ctx.buildCtx(STRANGER)).length).toBe(before);
	});

	test('the refusal still stands by default', async () => {
		expect(await refusalOf(() => accountImport.importAccount(STRANGER, file))).toMatch(
			/not a format this app accepts/
		);
	});

	test('dropUnacceptable brings in the rest and says what it left', async () => {
		const result = await accountImport.importAccount(STRANGER, file, { dropUnacceptable: true });

		// The good picture and the idea landed; the crafted one did not.
		expect(result.tables).toContainEqual({ name: 'media', rows: 1 });
		expect(result.tables).toContainEqual({ name: 'ideas', rows: 1 });
		expect(result.skipped).toContainEqual({
			name: 'media',
			rows: 1,
			why: 'accountImport.notAFormatThisApp'
		});
	});
});
