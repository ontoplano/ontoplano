import type { PlainKey } from '../i18n/keys.js';
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
 * `inventory_items` row names a `inventory_categories` id. Those numbers mean
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
 *
 * Here rather than under `$lib/server` because none of that needs a server:
 * an instance that is a phone takes an export back exactly as one with a
 * database on a disk does. What stayed behind is the copy the server keeps
 * beside that disk first — see `server/services/account-import.ts`.
 */
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { db } from '$lib/db/index.js';
import { record as audit } from '$lib/services/audit.js';
import { ValidationError } from '$lib/services/errors.js';
import { sha256Hex } from '$lib/services/digest.js';
import { USER_TABLES, type AccountExport } from '$lib/services/account-data.js';
import { sniff, tidyFilename } from '$lib/services/media.js';
import { RINGTONE_TYPES } from '$lib/services/ringtones.js';

/**
 * Base64 back into bytes, in either world.
 *
 * `Buffer.from(s, 'base64')` is what this used to say, and on a device it is
 * the stand-in in `$lib/isolated/buffer-stand-in.ts` — which ignores the
 * encoding argument and UTF-8-encodes the string instead. That does not throw:
 * it silently turns every picture in the file into nonsense bytes, which the
 * sniffer then rejects as "not a format this app accepts". `atob` is in both.
 */
function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Rows that are about this instance rather than about the person.
 *
 * Each one is dropped on the way in, and the reason is the comment beside it.
 * Anything not named here travels.
 */
export const NOT_PORTABLE: Record<string, PlainKey> = {
	// What somebody is paying, and to whom. An import must never be a way to
	// arrive on an instance already subscribed.
	subscriptions: 'accountImport.billingBelongsToTheInstance',
	billingCheckouts: 'accountImport.billingBelongsToTheInstance',
	// Secrets minted by another instance, stored as hashes. They would be
	// unusable here and would look like live credentials on the tokens page.
	apiTokens: 'accountImport.aTokenIsASecret',
	pluginManifests: 'accountImport.aManifestBelongsToThe',
	// A feed address handed out by another instance. Importing it would show a
	// URL that nothing here answers.
	calendarFeeds: 'accountImport.aFeedAddressBelongsTo',
	// These fire outbound requests. An import is not consent to start doing
	// that from a new place.
	webhookSubscriptions: 'accountImport.aSubscriptionWouldStartPosting',
	// The record of what happened on the old account, on the old instance. The
	// import writes one event of its own instead.
	auditEvents: 'accountImport.theLogIsARecord',
	// An address at a push service, tied to one browser and to the key of the
	// instance it subscribed to. Nothing here could send to it, and permission
	// given to one site is not permission given to another.
	pushSubscriptions: 'accountImport.aDeviceAgreedToHear',
	// A code mid-handshake with an assistant, against a client this instance
	// has never heard of and an address it never registered. It expires in
	// minutes and is worth nothing anywhere but where it was issued.
	oauthCodes: 'accountImport.aCodeBelongsToTheHandshake'
};

export type ImportResult = {
	/** How many rows landed, per table, largest first. */
	tables: { name: string; rows: number }[];
	total: number;
	/** Named in the file, so the page can say whose account this was. */
	from: { email: string; exportedAt: string } | null;
	skipped: { name: string; rows: number; why: PlainKey }[];
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
			throw new ValidationError({ key: 'errors.accountImport.thatFileIsTooBig' });
		try {
			raw = JSON.parse(raw);
		} catch {
			throw new ValidationError({ key: 'errors.accountImport.thatFileIsNotJson' });
		}
	}

	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ValidationError({ key: 'errors.accountImport.thatFile' });

	const body = raw as Partial<AccountExport>;
	if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))
		throw new ValidationError({ key: 'errors.accountImport.thatFileHasNoAccount' });

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
		// Empty for a file written before exports carried one. Nothing reads it
		// yet; it is kept through the parse so that when something does, the
		// files already in people's folders have it.
		version: typeof body.version === 'string' ? body.version : '',
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

export type ImportPreview = {
	/** Whose account the file says it was, or null for a file that does not say. */
	from: { email: string; exportedAt: string } | null;
	/** What would land, per table, largest first. */
	tables: { name: string; rows: number }[];
	total: number;
	/** What would be left behind, and why. */
	skipped: { name: string; rows: number; why: PlainKey }[];
	/**
	 * Rows the import would refuse outright — a picture in no format this app
	 * accepts, a sound outside the allowlist. One of these fails the whole
	 * restore unless it is dropped on the way in.
	 */
	unacceptable: { name: string; rows: number; why: PlainKey }[];
};

/**
 * Everything the import would decide, decided before anything is written.
 *
 * A restore empties the account first, so the moment to learn that the file
 * carries a picture the import will refuse is before agreeing to that, not
 * three seconds into a transaction that then rolls back with one sentence.
 * This runs the same parsing, the same skip rules and the same byte-sniffing
 * the import runs, and writes nothing.
 */
export function previewImport(payload: unknown): ImportPreview {
	const parsed = parseExport(payload);
	const byName = new Map(USER_TABLES.map((t) => [t.name, t]));

	const skipped: ImportPreview['skipped'] = [];
	for (const [name, why] of Object.entries(NOT_PORTABLE)) {
		const rows = parsed.data[name];
		if (Array.isArray(rows) && rows.length > 0) skipped.push({ name, rows: rows.length, why });
	}
	for (const name of Object.keys(parsed.data)) {
		if (byName.has(name) || name in NOT_PORTABLE) continue;
		const rows = parsed.data[name];
		if (Array.isArray(rows) && rows.length > 0)
			skipped.push({ name, rows: rows.length, why: 'accountImport.thisVersionHasNoSuch' });
	}

	const unacceptable: ImportPreview['unacceptable'] = [];
	const bad = countUnacceptable(parsed);
	if (bad.media > 0)
		unacceptable.push({
			name: 'media',
			rows: bad.media,
			why: 'accountImport.notAPictureFormat'
		});
	if (bad.ringtones > 0)
		unacceptable.push({
			name: 'ringtones',
			rows: bad.ringtones,
			why: 'accountImport.notASoundFormat'
		});

	const tables: ImportPreview['tables'] = [];
	for (const table of USER_TABLES) {
		if (table.name in NOT_PORTABLE) continue;
		const rows = parsed.data[table.name];
		if (Array.isArray(rows) && rows.length > 0)
			tables.push({ name: table.name, rows: rows.length });
	}

	return {
		from: parsed.account.email
			? { email: parsed.account.email, exportedAt: parsed.exportedAt }
			: null,
		tables: tables.sort((a, b) => b.rows - a.rows),
		total: tables.reduce((sum, t) => sum + t.rows, 0),
		skipped,
		unacceptable
	};
}

/** Whether one media or ringtone row is something this app would serve. */
function acceptableBytes(name: string, raw: unknown): boolean {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
	const row = raw as Record<string, unknown>;
	if (name === 'media') {
		const bytes = typeof row.bytes === 'string' ? fromBase64(row.bytes) : null;
		return bytes !== null && sniff(bytes) !== null;
	}
	if (name === 'ringtones') return (RINGTONE_TYPES as readonly string[]).includes(String(row.mime));
	return true;
}

function countUnacceptable(parsed: AccountExport): { media: number; ringtones: number } {
	const count = (name: 'media' | 'ringtones') => {
		const rows = parsed.data[name];
		if (!Array.isArray(rows)) return 0;
		return rows.filter((row) => !acceptableBytes(name, row)).length;
	};
	return { media: count('media'), ringtones: count('ringtones') };
}

/**
 * Every picture in the file, hashed once, keyed by whatever it arrived as.
 *
 * A picture reaches here in one of two shapes. Through the page it is base64,
 * because that is what JSON holds; handed straight from `exportAccount` in the
 * same process — which is how the suite and the demo seed do it — it is the
 * bytes themselves. So the key is the value as it arrived: the string, which
 * both passes over the file have in common, or the array, whose identity
 * survives the row being copied.
 *
 * Not the decoded bytes, which was the first attempt and silently matched
 * nothing: the transaction below decodes each row again on its own, and two
 * arrays holding the same bytes are not the same key.
 *
 * Same bytes in, same hash out, on a server and on a phone alike — an export
 * taken from one and opened on the other has to agree about which two rows are
 * one picture, which is the whole reason the column exists.
 */
async function pictureHashes(parsed: AccountExport): Promise<Map<unknown, string>> {
	const hashes = new Map<unknown, string>();
	const rows = parsed.data['media'];
	if (!Array.isArray(rows)) return hashes;

	for (const raw of rows) {
		/*
		 * The sanitised value, not the raw one.
		 *
		 * `sanitise` is what the transaction sees, and it truncates a long
		 * string and drops anything that is not a primitive — so hashing what
		 * arrived and looking up what survived is two different keys, and the
		 * lookup silently found nothing. Running it here too costs one pass
		 * over the picture rows and makes the two keys the same by
		 * construction rather than by agreement.
		 */
		const value = sanitise(raw as Record<string, unknown>).bytes;
		if (hashes.has(value)) continue;
		if (typeof value === 'string') hashes.set(value, await sha256Hex(fromBase64(value)));
		else if (value instanceof Uint8Array) hashes.set(value, await sha256Hex(value));
	}
	return hashes;
}

export async function importAccount(
	userId: string,
	payload: unknown,
	opts: {
		dropUnacceptable?: boolean;
		/**
		 * Where a copy of the account was kept before this replaced it, for the
		 * audit line. The server writes one beside the database; a device takes
		 * a different one, because a file beside the database there is a file
		 * nobody can reach. Null when none was taken.
		 */
		rescue?: string | null;
	} = {}
): Promise<ImportResult> {
	const parsed = parseExport(payload);

	/*
	 * Every picture's fingerprint, before a single row is touched.
	 *
	 * The digest is `crypto.subtle`, which is the one both worlds have and is
	 * therefore asynchronous — and the refill below is a single synchronous
	 * transaction, deliberately, because an import that half-lands over a real
	 * week is the one outcome worth any amount of trouble to avoid. So the
	 * hashing happens here, in one pass, and the transaction reads the answers.
	 */
	const fingerprints = await pictureHashes(parsed);

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
			skipped.push({ name, rows: rows.length, why: 'accountImport.thisVersionHasNoSuch' });
	}

	const counts: { name: string; rows: number }[] = [];

	db.transaction((tx) => {
		/*
		 * Emptied first — except the tables this import is not going to refill.
		 *
		 * This deleted everything and then skipped re-inserting whatever
		 * `NOT_PORTABLE` names, which meant an import *destroyed* the rows that
		 * belong to this instance rather than to the file: the subscription, the
		 * record of what had been paid, the API tokens, the calendar links. A
		 * paying account that restored a backup was asked to pay again on the
		 * next page load, and its tokens had silently stopped working.
		 *
		 * The rule was always right and only half-applied. A row this import
		 * will not carry in is a row it has no business carrying out.
		 *
		 * `USER_TABLES` is ordered children-first for the delete, which is why
		 * the insert below walks it backwards.
		 */
		for (const table of USER_TABLES) {
			if (table.name in NOT_PORTABLE) continue;
			table.remove(tx, userId);
		}

		/** Old id → new id, per table, keyed by the SQL name a reference uses. */
		const remap = new Map<string, Map<number, number>>();

		for (const table of [...USER_TABLES].reverse()) {
			if (table.name in NOT_PORTABLE) continue;

			const rows = parsed.data[table.name];
			if (!Array.isArray(rows) || rows.length === 0) continue;

			const refs = referencesOf(table.table);
			const mine = new Map<number, number>();
			remap.set(toSql.get(table.name)!, mine);

			let droppedHere = 0;
			/*
			 * Rows the database itself will not take twice.
			 *
			 * Nothing in the schema refuses one at the moment — a habit's day
			 * did for one release and does not any more — so this is here for
			 * the next rule somebody adds. What it buys when that happens: the
			 * restore names the row it could not take, rather than either
			 * losing it quietly or refusing the whole file over one of them.
			 */
			let doubledHere = 0;
			for (const raw of rows) {
				if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;

				/*
				 * A row the checks below would refuse, left out on request.
				 *
				 * The default is still to fail the whole restore: silently
				 * losing a picture is worse than saying no. But the page's
				 * preview names exactly these rows, and somebody who has read
				 * that list and said "bring in the rest" should not be held
				 * hostage by them.
				 */
				if (opts.dropUnacceptable && !acceptableBytes(table.name, raw)) {
					droppedHere++;
					continue;
				}

				const row = sanitise(raw as Record<string, unknown>);

				// What the bytes arrived as, kept before the decode below replaces
				// it: `pictureHashes` above is keyed by exactly that.
				const asGiven = row.bytes;

				// …and the blob columns back into bytes. The export wrote them as
				// base64 because a Buffer is not a thing JSON holds; the schema is
				// what says which strings to read that way, so no marker in the
				// file can make the import decode a column that is really text.
				for (const key of blobKeys(table.table))
					if (typeof row[key] === 'string') row[key] = fromBase64(row[key]);

				/*
				 * The two tables whose rows are served back as raw bytes under
				 * their stored type. The upload paths derive that type on the
				 * server — a picture from its first bytes, a sound from a short
				 * allowlist — and a row arriving in a file gets exactly the same
				 * treatment, because a stored `text/html` "picture" served from
				 * this origin is script running as the person who imported it.
				 */
				if (table.name === 'media') {
					// `Uint8Array`, not `Buffer`: a Buffer is one of those, and the
					// decode above returns the plain kind so a device — which has no
					// Buffer at all — reaches this line with something real in it.
					const kind = row.bytes instanceof Uint8Array ? sniff(row.bytes) : null;
					if (!kind)
						throw new ValidationError({ key: 'errors.accountImport.theFileCarriesAPicture' });
					row.mime = kind.mime;
					row.filename = tidyFilename(String(row.filename ?? '')) || `picture.${kind.extension}`;
					row.byteSize = (row.bytes as Uint8Array).length;
					row.sha256 = fingerprints.get(asGiven);
					if (typeof row.sha256 !== 'string')
						throw new Error('a picture was not hashed before the import began');
				}
				if (table.name === 'ringtones') {
					if (!(RINGTONE_TYPES as readonly string[]).includes(String(row.mime)))
						throw new ValidationError({ key: 'errors.accountImport.theFileCarriesASound' });
					if (row.data instanceof Uint8Array) row.bytes = row.data.length;
				}

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

				let inserted: { id: number } | undefined;
				try {
					inserted = tx
						.insert(table.table)
						.values(row as never)
						.returning({ id: (table.table as unknown as { id: never }).id })
						.get() as { id: number } | undefined;
				} catch (error) {
					if ((error as { code?: string })?.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw error;
					doubledHere++;
					continue;
				}

				if (inserted && typeof wasId === 'number') mine.set(wasId, inserted.id);
			}

			counts.push({ name: table.name, rows: rows.length - droppedHere - doubledHere });
			if (droppedHere > 0)
				skipped.push({
					name: table.name,
					rows: droppedHere,
					why: 'accountImport.notAFormatThisApp'
				});
			if (doubledHere > 0)
				skipped.push({
					name: table.name,
					rows: doubledHere,
					why: 'accountImport.aDayAlreadyLogged'
				});
		}
	});

	const total = counts.reduce((sum, c) => sum + c.rows, 0);

	audit(userId, 'data_imported', {
		detail: {
			from: parsed.account.email || null,
			exportedAt: parsed.exportedAt,
			rows: total,
			// Where the account was kept before it was replaced, so the log line
			// is enough to undo this without anybody having to remember a path
			// or know that a copy was taken at all. Null where none was.
			rescue: opts.rescue ?? null
		}
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
/**
 * The property names of a table's blob columns.
 *
 * Read from drizzle's own column objects rather than listed here: a second blob
 * column added later is decoded without anybody remembering this file exists.
 */
function blobKeys(table: never): string[] {
	const keys: string[] = [];
	for (const [key, value] of Object.entries(table as object)) {
		if (!value || typeof value !== 'object') continue;
		const column = value as { dataType?: string; columnType?: string };
		if (column.dataType === 'buffer' || column.columnType === 'SQLiteBlobBuffer') keys.push(key);
	}
	return keys;
}

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
