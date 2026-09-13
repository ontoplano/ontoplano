#!/usr/bin/env node
/**
 * Which migrations a database has actually applied, and which are strangers.
 *
 * `scripts/migrate.mjs` refuses a database holding a migration hash the repo
 * cannot produce, which is the right thing to do and a terrible thing to
 * debug: it says how many strangers there are and nothing about which. This
 * prints the whole list — every applied migration, named where the repo can
 * name it, with the moment it was applied — so the answer to "what did this
 * database run, and when" is one command rather than an afternoon.
 *
 *   node scripts/migration-strangers.mjs [path/to.db]
 *
 * Reads only. The database is opened read-only, so this is safe to point at a
 * server's live file.
 */
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Every version of every migration this repository has ever held.
 *
 * A stranger is a hash the working tree cannot produce, and the useful next
 * question is always "which migration was it, and when did it look like that".
 * Git knows: each commit that touched `drizzle/` has its own copy of each file,
 * so hashing all of them gives a lookup from the mystery hash to a name and the
 * commit it came from.
 *
 * Skipped silently outside a checkout — a deployed copy is not one — because
 * the list of applied migrations is still worth printing there.
 */
function everyVersionEverCommitted() {
	const seen = new Map();
	let commits;
	try {
		commits = execFileSync(
			'git',
			['log', '--all', '--format=%H %ad', '--date=short', '--', 'drizzle'],
			{
				encoding: 'utf8'
			}
		)
			.trim()
			.split('\n')
			.filter(Boolean);
	} catch {
		return seen;
	}

	for (const line of commits) {
		const [commit, date] = line.split(' ');
		let files;
		try {
			files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'drizzle'], {
				encoding: 'utf8'
			})
				.trim()
				.split('\n')
				.filter((name) => name.endsWith('.sql'));
		} catch {
			continue;
		}
		for (const file of files) {
			try {
				const bytes = execFileSync('git', ['show', `${commit}:${file}`], {
					encoding: 'buffer',
					maxBuffer: 1 << 24
				});
				const hash = sha(bytes);
				// The oldest commit holding a given content is the one worth naming:
				// it is when that version of the file came into being.
				seen.set(hash, { tag: file.replace(/^drizzle\//, '').replace(/\.sql$/, ''), commit, date });
			} catch {
				/* a path that did not exist at that commit */
			}
		}
	}
	return seen;
}

/**
 * Whether this checkout is missing commits its remote has.
 *
 * Asked only when there are strangers, and only to say so: the answer is a
 * cheap `rev-list` against whatever `@{upstream}` resolves to, and a clone
 * with no upstream — a deployed copy, an export — is simply not behind.
 */
function behindTheRemote() {
	try {
		const count = execFileSync('git', ['rev-list', '--count', 'HEAD..@{upstream}'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
		return Number(count) > 0;
	} catch {
		return false;
	}
}

const path =
	process.argv[2] ||
	process.env.DATABASE_URL ||
	join(homedir(), '.local/share/ontoplano/ontoplano.db');

const db = new Database(path, { readonly: true, fileMustExist: true });

const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));
const known = new Map(
	journal.entries.map((entry) => [
		createHash('sha256')
			.update(readFileSync(`./drizzle/${entry.tag}.sql`))
			.digest('hex'),
		entry.tag
	])
);

const table = db
	.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
	.get();
if (!table) {
	console.log(`${path}\n  no migrations table — nothing has ever been applied here`);
	process.exit(0);
}

const applied = db
	.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
	.all();

console.log(`${path}\n  ${applied.length} applied, ${known.size} in this build\n`);

const strangers = [];
for (const row of applied) {
	const tag = known.get(row.hash);
	const when = new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19);
	if (tag) console.log(`  ${when}  ${tag}`);
	else {
		strangers.push(row);
		console.log(`  ${when}  STRANGER ${row.hash.slice(0, 16)}…`);
	}
}

// And what this build has that the database has not.
const missing = journal.entries.filter(
	(entry) =>
		!applied.some(
			(row) =>
				row.hash ===
				createHash('sha256')
					.update(readFileSync(`./drizzle/${entry.tag}.sql`))
					.digest('hex')
		)
);
if (missing.length > 0) console.log(`\n  not yet applied: ${missing.map((e) => e.tag).join(', ')}`);

if (strangers.length > 0) {
	console.log(`\n  ${strangers.length} stranger(s):\n`);
	const history = everyVersionEverCommitted();
	for (const row of strangers) {
		const found = history.get(row.hash);
		if (found) {
			console.log(
				`  ${row.hash}\n` +
					`    is ${found.tag} as it stood at ${found.commit.slice(0, 8)} (${found.date}).\n` +
					'    This database ran that version; the working tree holds a different one.\n'
			);
		} else {
			console.log(
				`  ${row.hash}\n` +
					'    matches no version of any migration this repository has ever held.\n' +
					'    It came from somewhere else: another branch, a migration written by\n' +
					'    hand, or a database copied from a different instance.\n'
			);
		}
	}
	if (history.size === 0)
		console.log('  (no git history here, so none of them could be looked up by name)');

	/*
	 * Or the clone is simply behind.
	 *
	 * The lookup can only name a migration this checkout has heard of, so a
	 * tree that has not fetched the commit which added one reports it as
	 * "from somewhere else" — four perfectly good migrations, applied by a
	 * deploy an hour earlier, accused of coming from nowhere. That reads as
	 * data corruption and it is a stale `git fetch`.
	 */
	if (strangers.length > 0 && behindTheRemote()) {
		console.log(
			'  This clone is behind its remote, which is the ordinary reason for all\n' +
				'  of the above: a migration it has never fetched cannot be named. Try\n' +
				'  `git fetch --all --tags` and run this again before believing any of it.\n'
		);
	}
	process.exit(1);
}
