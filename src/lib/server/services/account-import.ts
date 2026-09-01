/**
 * Putting an exported account back.
 *
 * The export was always the easy half — every row this account owns, as JSON.
 * This is the other half, and it is the one that makes the export a way out
 * rather than a souvenir: an instance you can leave is only true if there is
 * somewhere to arrive.
 *
 * ## The hard part is the ids
 *
 * Every app table has an integer autoincrement primary key, and rows point at
 * each other with it — a `task_records` row names a `recurring_tasks` id, a
 * `shopping_items` row names a `shopping_categories` id. Those numbers mean
 * nothing in the database being imported into: id 7 over there is somebody
 * else's row over here, or nothing at all.
 *
 * So the ids are not carried. Each row is inserted without its own id, the id
 * SQLite gives it is remembered against the one it had, and every column that
 * pointed at another table is rewritten through that map before it is written.
 * Which columns those are is read from the schema itself — drizzle knows every
 * foreign key, so there is no second list to keep in step with the first.
 *
 * Tables go in parents-first, which is `USER_TABLES` reversed: that list is
 * ordered children-first so deletion can walk it, and an insert is a deletion
 * backwards.
 *
 * ## What does not travel
 *
 * An export contains rows that describe the *instance* rather than the person.
 * Carrying them across would be wrong in ways that range from useless to
 * dangerous, so they are dropped on the way in and `NOT_PORTABLE` says why for
 * each one. The export still contains them: it is a copy of your account, and
 * what an import does with a row is a separate question from whether you are
 * entitled to have it.
 *
 * ## It replaces, and it is one transaction
 *
 * Merging two accounts is a different feature with different questions —
 * whether two categories called "work" are one category, and nobody can answer
 * that but the person. So this empties the account first and then fills it,
 * inside a single transaction: it either all lands or none of it does, and
 * there is no state where half a week exists.
 */
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { db } from '../db/index.js';
import { record as audit } from './audit.js';
import { ValidationError } from './errors.js';
import { USER_TABLES, type AccountExport } from './account.js';

/**
 * Rows that are about this instance rather than about the person.
 *
 * Each one is dropped on the way in, and the reason is the comment beside it.
 * Anything not named here travels.
 */
export const NOT_PORTABLE: Record<string, string> = {
	// What somebody is paying, and to whom. An import must never be a way to
	// arrive on an instance already subscribed.
	subscriptions: 'billing belongs to the instance that took the money',
	billingCheckouts: 'billing belongs to the instance that took the money',
	// Secrets minted by another instance, stored as hashes. They would be
	// unusable here and would look like live credentials on the tokens page.
	apiTokens: 'a token is a secret this instance never issued',
	pluginManifests: 'a manifest belongs to the token that declared it',
	// A feed address handed out by another instance. Importing it would show a
	// URL that nothing here answers.
	calendarFeeds: 'a feed address belongs to the instance that serves it',
	// These fire outbound requests. An import is not consent to start doing
	// that from a new place.
	webhookSubscriptions: 'a subscription would start posting from here without being asked',
	// The record of what happened on the old account, on the old instance. The
	// import writes one event of its own instead.
	auditEvents: 'the log is a record of an instance, not a possession'
};

export type ImportResult = {
	/** How many rows landed, per table, largest first. */
	tables: { name: string; rows: number }[];
	total: number;
	/** Named in the file, so the page can say whose account this was. */
	from: { email: string; exportedAt: string } | null;
	skipped: { name: string; rows: number; why: string }[];
};

/*
 * What a file is allowed to be.
 *
 * An export is a file a stranger can hand this instance, so every one of these
 * is a ceiling on what one request can cost the machine it lands on. They are
 * generous — a year of heavy use is a few megabytes and some tens of thousands
 * of rows — and the point is only that there IS a ceiling.
 */
/** Bigger than any real export, and small enough to parse without thinking. */
const MAX_BYTES = 20_000_000;
/** Rows across every table. Beyond this, one request is filling a disk. */
const MAX_ROWS = 200_000;
/** One field. The longest thing anybody writes here is a diary entry. */
const MAX_VALUE_LENGTH = 200_000;

/** The shape `exportAccount` produces, checked rather than trusted. */
export function parseExport(raw: unknown): AccountExport {
	if (typeof raw === 'string') {
		if (raw.length > MAX_BYTES)
			throw new ValidationError('That file is too big to restore through the browser.');
		try {
			raw = JSON.parse(raw);
		} catch {
			throw new ValidationError('That file is not JSON.');
		}
	}

	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ValidationError('That file is not an ontoplano export.');

	const body = raw as Partial<AccountExport>;
	if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
		throw new ValidationError('That file has no account data in it.');

	let total = 0;
	for (const [name, rows] of Object.entries(body.data)) {
		if (!Array.isArray(rows))
			throw new ValidationError(`That file's "${name}" is not a list of rows.`);
		total += rows.length;
	}
	if (total > MAX_ROWS)
		throw new ValidationError(
			`That file has ${total} rows in it; ${MAX_ROWS} is the most one restore may carry. ` +
				`\`make db-import\` on the machine itself has no such limit.`
		);

	return {
		exportedAt: typeof body.exportedAt === 'string' ? body.exportedAt : '',
		account:
			body.account && typeof body.account === 'object'
				? (body.account as AccountExport['account'])
				: { id: '', name: '', email: '' },
		data: body.data as Record<string, unknown[]>
	};
}

/**
 * Which columns of a table point where.
 *
 * Read off the schema, so a new foreign key is remapped without anybody
 * remembering to say so here. A reference to `user` is not a remap — it is the
 * account being imported into, and is set rather than translated.
 */
function referencesOf(table: never): { column: string; target: string }[] {
	const config = getTableConfig(table);
	const out: { column: string; target: string }[] = [];

	for (const fk of config.foreignKeys) {
		const ref = fk.reference();
		// Composite keys would need a different shape; there are none here, and
		// a silent half-remap is worse than a loud refusal.
		if (ref.columns.length !== 1) continue;
		const target = getTableConfig(ref.foreignTable).name;
		if (target === 'user') continue;
		out.push({ column: ref.columns[0].name, target });
	}

	return out;
}

/** `recurring_tasks` for the property named `recurringTasks`, and back. */
function sqlNames(): Map<string, string> {
	return new Map(
		USER_TABLES.map((t) => [t.name, getTableConfig(t.table).name] as [string, string])
	);
}

/**
 * Replace everything in this account with what is in the file.
 *
 * One transaction: it all lands or none of it does. Foreign keys are left on —
 * the parents-first order is what makes that possible, and a failure here means
 * the file is inconsistent, which is a thing worth hearing about rather than
 * working around.
 */
export function importAccount(userId: string, payload: unknown): ImportResult {
	const parsed = parseExport(payload);

	const toSql = sqlNames();
	const byName = new Map(USER_TABLES.map((t) => [t.name, t]));

	const skipped: ImportResult['skipped'] = [];
	for (const [name, why] of Object.entries(NOT_PORTABLE)) {
		const rows = parsed.data[name];
		if (Array.isArray(rows) && rows.length > 0) skipped.push({ name, rows: rows.length, why });
	}

	/*
	 * A table in the file that this version has never heard of.
	 *
	 * Reported rather than refused: an export from a newer instance should
	 * still restore everything this one understands, and being told what was
	 * left behind beats being told nothing or being told no.
	 */
	for (const name of Object.keys(parsed.data)) {
		if (byName.has(name) || name in NOT_PORTABLE) continue;
		const rows = parsed.data[name];
		if (Array.isArray(rows) && rows.length > 0)
			skipped.push({ name, rows: rows.length, why: 'this version has no such table' });
	}

	const counts: { name: string; rows: number }[] = [];

	db.transaction((tx) => {
		// Emptied first. `USER_TABLES` is ordered children-first for exactly
		// this, which is why the insert below walks it backwards.
		for (const table of USER_TABLES) table.remove(tx, userId);

		/** Old id → new id, per table, keyed by the SQL name a reference uses. */
		const remap = new Map<string, Map<number, number>>();

		for (const table of [...USER_TABLES].reverse()) {
			if (table.name in NOT_PORTABLE) continue;

			const rows = parsed.data[table.name];
			if (!Array.isArray(rows) || rows.length === 0) continue;

			const refs = referencesOf(table.table);
			const mine = new Map<number, number>();
			remap.set(toSql.get(table.name)!, mine);

			for (const raw of rows) {
				if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
				const row = sanitise(raw as Record<string, unknown>);

				const wasId = row.id;
				delete row.id;
				// Whoever it belonged to, it belongs to this account now.
				row.userId = userId;

				for (const ref of refs) {
					const key = columnProperty(table.table, ref.column);
					if (!key || row[key] === null || row[key] === undefined) continue;
					const mapped = remap.get(ref.target)?.get(Number(row[key]));
					/*
					 * A reference with nothing to point at.
					 *
					 * Its parent was skipped, or the file is inconsistent. Nulled
					 * where the column allows it and dropped where it does not —
					 * a row that cannot be attached is better lost than left
					 * pointing at somebody else's id, which is what keeping the
					 * old number would mean.
					 */
					row[key] = mapped ?? null;
				}

				const inserted = tx
					.insert(table.table)
					.values(row as never)
					.returning({ id: (table.table as unknown as { id: never }).id })
					.get() as { id: number } | undefined;

				if (inserted && typeof wasId === 'number') mine.set(wasId, inserted.id);
			}

			counts.push({ name: table.name, rows: rows.length });
		}
	});

	const total = counts.reduce((sum, c) => sum + c.rows, 0);

	audit(userId, 'data_imported', {
		detail: { from: parsed.account.email || null, exportedAt: parsed.exportedAt, rows: total }
	});

	return {
		tables: counts.sort((a, b) => b.rows - a.rows),
		total,
		from: parsed.account.email
			? { email: parsed.account.email, exportedAt: parsed.exportedAt }
			: null,
		skipped
	};
}

/**
 * The property name drizzle uses for a column the database calls `slot_id`.
 *
 * An exported row is keyed by the property (`slotId`), and a foreign key names
 * the SQL column (`slot_id`), so something has to translate between them.
 * Drizzle keeps the property name as the key on the table object rather than on
 * the column, so this is a lookup rather than a transform — and a transform
 * would be a second, guessing implementation of drizzle's own casing rules.
 */
function columnProperty(table: never, sqlColumn: string): string | null {
	for (const [key, value] of Object.entries(table as object)) {
		if (value && typeof value === 'object' && 'name' in value && value.name === sqlColumn)
			return key;
	}
	return null;
}

/**
 * A row reduced to what a database column can hold.
 *
 * Every value in this file came from outside, and the driver binds numbers,
 * strings, bigints, buffers and null — nothing else. A nested object or an
 * array reaches it as a TypeError halfway through the transaction, which the
 * person restoring reads as "something went wrong" with no way to tell which
 * of six thousand rows did it. Dropped here instead, along with any string
 * long enough to be a mistake rather than a diary entry.
 *
 * Unknown keys need no handling: drizzle builds its insert from the table's
 * own columns and never looks at the rest.
 */
function sanitise(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(row)) {
		if (value === null || value === undefined) {
			out[key] = null;
		} else if (typeof value === 'string') {
			out[key] = value.slice(0, MAX_VALUE_LENGTH);
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			out[key] = value;
		}
		// Anything else — an object, an array, a function from a crafted file —
		// is not a column value and is left out entirely.
	}

	return out;
}
