/**
 * onto-readings — a CSV of measurements becomes a data stream.
 *
 * The third reference ontoplano plugin, and the one that shows what data
 * streams are actually for. `onto-morning.mjs` reads; `onto-household.mjs` is a
 * two-way sync; this one is a producer, which is the shape most integrations
 * end up being.
 *
 * Every cheap bathroom scale, sleep tracker and blood-pressure cuff has an app
 * that exports a CSV, and every one of them is a walled garden otherwise. Point
 * this at the export and the numbers are yours: charted in Health, readable
 * over the API, and in one SQLite file you can walk away with.
 *
 * A file, deliberately — not an account somewhere. Nothing here talks to
 * Withings, Garmin or Fitbit, because the moment a plugin holds somebody
 * else's credentials the interesting question stops being "what does this do"
 * and becomes "who else can read my weight". Whatever you already have on disk
 * is enough.
 *
 * Setup:
 *   1. Settings → Integrations → new API token with "Send readings into your
 *      data streams" (`streams:write`). Nothing else — this script never reads
 *      your plan, your diary or anything you wrote.
 *
 *   2. Export from whatever app you use. Anything with a date column and a
 *      number column works:
 *
 *        Date,Weight (kg),Body fat (%)
 *        2026-08-01,78.4,19.2
 *        2026-08-02,78.1,19.4
 *
 *   3. Run it:
 *
 *        ONTO_URL=https://app.ontoplano.com ONTO_TOKEN=onto_… \
 *        node onto-readings.mjs scale-export.csv
 *
 *      It says what it would do and stops. Add --write to actually send:
 *
 *        … node onto-readings.mjs scale-export.csv --write
 *
 * Run it again on the same file and nothing is added twice: every row carries
 * an `external_id` built from the stream and the date, and the server reports a
 * repeat as a duplicate rather than as an error. Re-exporting a longer file
 * every month and running this on the whole thing is the intended use.
 *
 * No dependencies, no server, nothing running when you are not running it.
 */

const url = (process.env.ONTO_URL ?? '').replace(/\/$/, '');
const token = process.env.ONTO_TOKEN ?? '';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('-'));
const write = args.includes('--write');

if (!url || !token || !file) {
	console.error('Usage: ONTO_URL=… ONTO_TOKEN=… node onto-readings.mjs <file.csv> [--write]');
	console.error('The token needs one scope: "Send readings into your data streams".');
	process.exit(1);
}

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * A CSV, in about twenty lines.
 *
 * Quoted fields with commas in them, doubled quotes inside those, and the
 * BOM Excel puts at the front of everything it writes. Not a full RFC 4180
 * parser and not trying to be — but these three are what actually arrives, and
 * a dependency to handle them is a dependency this file exists to avoid.
 */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];

		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
			continue;
		}

		if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (c !== '\r') field += c;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}

	// Excel's byte-order mark lands on the first header, so `Date` arrives with
	// U+FEFF in front of it and never matches anything.
	if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
	return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** `Weight (kg)` → `{ name: 'Weight', unit: 'kg' }`. */
function splitUnit(header) {
	const match = /^(.*?)\s*[([]([^)\]]+)[)\]]\s*$/.exec(header.trim());
	if (!match) return { name: header.trim(), unit: null };
	return { name: match[1].trim() || header.trim(), unit: match[2].trim().slice(0, 20) };
}

/** `Weight (kg)` in `scale-export.csv` → `scale-export-weight`. */
function slugify(...parts) {
	return parts
		.join('-')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);
}

/**
 * A date column's value, as an instant.
 *
 * `2026-08-01`, `2026-08-01 07:14`, `01/08/2026` and a few others all turn up.
 * A bare date becomes noon rather than midnight: midnight is the value most
 * likely to land on the wrong side of a timezone and move a reading to the day
 * before, and nobody weighs themselves at exactly midnight anyway.
 */
function toInstant(raw) {
	const value = raw.trim();
	if (!value) return null;

	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`).toISOString();

	// Day-first, which is what most of Europe and Brazil export.
	const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
	if (dmy) {
		const [, d, m, y] = dmy;
		return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00`).toISOString();
	}

	// Anything else goes to Date, but only if it looks like a date at all.
	// `new Date('78.4')` is a valid date to V8 — some time in 1978 — so a column
	// of weights was read as the date column and the real one was ignored.
	if (!/[-/:]/.test(value) && !/[a-z]/i.test(value)) return null;

	const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toNumber(raw) {
	// A comma decimal separator is what half the world's exports use.
	const value = raw.trim().replace(',', '.');
	if (!value) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

async function api(path, body) {
	const res = await fetch(`${url}${path}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : {};
}

// ── Read it ──────────────────────────────────────────────────────────────────

const rows = parseCsv(readFileSync(file, 'utf8'));
if (rows.length < 2) {
	console.error(`${file}: a header row and at least one reading, please.`);
	process.exit(1);
}

const [header, ...body] = rows;

// The first column that parses as a date in the first row of data. Named "Date"
// in most exports and "Timestamp", "Datum" or "Data" in the rest, so it is
// found by what it holds rather than by what it is called.
const dateIndex = header.findIndex((_, i) => toInstant(body[0][i] ?? '') !== null);
if (dateIndex === -1) {
	console.error(`${file}: no column in the first row parses as a date.`);
	console.error(`Columns: ${header.join(', ')}`);
	process.exit(1);
}

const source = basename(file).replace(/\.[^.]+$/, '');

/** One stream per numeric column, with the rows that have a number in it. */
const streams = header
	.map((name, index) => ({ ...splitUnit(name), index }))
	.filter((column) => column.index !== dateIndex)
	.map((column) => ({
		...column,
		slug: slugify(source, column.name),
		points: body
			.map((row) => ({
				at: toInstant(row[dateIndex] ?? ''),
				value: toNumber(row[column.index] ?? '')
			}))
			.filter((p) => p.at !== null && p.value !== null)
	}))
	.filter((s) => s.points.length > 0);

if (streams.length === 0) {
	console.error(`${file}: found a date column but no numbers beside it.`);
	process.exit(1);
}

console.log(`${file}: ${body.length} rows, ${streams.length} stream(s)\n`);
for (const s of streams) {
	console.log(`  ${s.slug}  ${s.name}${s.unit ? ` (${s.unit})` : ''}  ${s.points.length} readings`);
	console.log(`    ${s.points[0].at.slice(0, 10)} → ${s.points.at(-1).at.slice(0, 10)}`);
}

if (!write) {
	console.log('\nNothing sent. Add --write to send it.');
	process.exit(0);
}

// ── Send it ──────────────────────────────────────────────────────────────────

// Well under the server's own ceiling, so a long history goes in whole rather
// than needing the person to split the file.
const BATCH = 200;

for (const stream of streams) {
	// Idempotent per slug: declaring a stream that exists updates its name and
	// unit and leaves everything else — including a retention window somebody
	// set in the UI — alone. So this runs on every import, not just the first.
	await api('/api/v1/streams', {
		slug: stream.slug,
		name: stream.name,
		source,
		kind: 'measurement',
		unit: stream.unit ?? undefined,
		display: 'line_chart'
	});

	let accepted = 0;
	let duplicates = 0;
	const rejected = [];

	for (let i = 0; i < stream.points.length; i += BATCH) {
		const batch = stream.points.slice(i, i + BATCH).map((p) => ({
			// The id that makes re-running this safe. One reading per stream per
			// instant is the rule these exports follow, and the server refuses
			// the second one rather than storing it twice.
			external_id: `${stream.slug}:${p.at}`,
			at: p.at,
			value: p.value
		}));

		const result = await api(`/api/v1/streams/${stream.slug}/points`, { points: batch });
		accepted += result.accepted ?? 0;
		duplicates += result.duplicates ?? 0;
		rejected.push(...(result.rejected ?? []));
	}

	const parts = [`${accepted} new`];
	if (duplicates) parts.push(`${duplicates} already there`);
	if (rejected.length) parts.push(`${rejected.length} refused`);
	console.log(`\n${stream.slug}: ${parts.join(', ')}`);

	// Named, not counted: a rejection is something about one row that has to be
	// looked at, and a number alone gives nobody anywhere to look.
	for (const r of rejected.slice(0, 5)) console.log(`  ${r.external_id ?? '?'}: ${r.reason}`);
	if (rejected.length > 5) console.log(`  …and ${rejected.length - 5} more`);
}

console.log('\nHealth → your streams.');
