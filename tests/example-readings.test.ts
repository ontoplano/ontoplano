import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `examples/onto-readings.mjs`, on the exports people actually have.
 *
 * The example plugins ship in the repository and are the first code anybody
 * writing an integration reads, so one of them being wrong is worse than a bug
 * in the app — it is a bug somebody copies. This one parses a CSV, and every
 * line of that parsing exists because of a real export: Excel's byte-order
 * mark, a comma decimal separator, a day-first date, a unit in the header, a
 * blank cell where a reading is missing.
 *
 * Driven as a subprocess in its dry-run mode, which sends nothing anywhere:
 * the script is a script, and the thing worth pinning is what it makes of a
 * file rather than any function inside it.
 */
const SCRIPT = join(import.meta.dirname, '..', 'examples', 'onto-readings.mjs');
let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'readings-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Run the example over one CSV and give back what it printed. */
function read(name: string, csv: string): string {
	const file = join(dir, name);
	writeFileSync(file, csv);
	try {
		return execFileSync('node', [SCRIPT, file], {
			encoding: 'utf8',
			env: { ...process.env, ONTO_URL: 'https://nowhere.invalid', ONTO_TOKEN: 'onto_x' }
		});
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string };
		return `FAILED\n${e.stdout ?? ''}${e.stderr ?? ''}`;
	}
}

describe('a CSV of readings', () => {
	test('one column per stream, with the unit taken out of the header', () => {
		const out = read(
			'scale.csv',
			'Date,Weight (kg),Body fat (%)\n2026-08-01,78.4,19.2\n2026-08-02,78.1,19.4\n'
		);

		expect(out).toContain('scale-weight');
		expect(out).toContain('Weight (kg)');
		expect(out).toContain('scale-body-fat');
		expect(out).toContain('2 readings');
		// A dry run says so and sends nothing.
		expect(out).toContain('Nothing sent');
	});

	test('a blank cell is a missing reading, not a zero', () => {
		const out = read(
			'gaps.csv',
			'Date,Weight (kg)\n2026-08-01,78.4\n2026-08-02,\n2026-08-03,77.9\n'
		);

		// Two, not three: a scale that was not stood on did not read zero.
		expect(out).toContain('2 readings');
	});

	test("Excel's byte-order mark does not hide the date column", () => {
		const out = read('bom.csv', '\uFEFFDate,Weight (kg)\n2026-08-01,78.4\n');

		expect(out).not.toContain('no column in the first row parses as a date');
		expect(out).toContain('1 readings');
	});

	test('a comma decimal separator is a number', () => {
		const out = read('comma.csv', 'Datum,Gewicht (kg)\n2026-08-01,"78,4"\n2026-08-02,"78,1"\n');

		expect(out).toContain('2 readings');
	});

	test('a day-first date is read day-first', () => {
		const out = read('dmy.csv', 'Date,Weight (kg)\n01/08/2026,78.4\n15/08/2026,78.1\n');

		// 01/08 is the first of August, not the eighth of January — so the span
		// is inside one month.
		expect(out).toContain('2026-08-01 → 2026-08-15');
	});

	test('a date column called something else is still found', () => {
		const out = read('named.csv', 'Timestamp,Weight (kg)\n2026-08-01 07:14,78.4\n');

		expect(out).toContain('1 readings');
	});

	test('a file with no numbers beside the date says so', () => {
		const out = read('words.csv', 'Date,Note\n2026-08-01,felt fine\n');

		expect(out).toContain('FAILED');
		expect(out).toContain('no numbers beside it');
	});

	test('a file with no date at all says so, and lists the columns', () => {
		const out = read('nodate.csv', 'Weight,Fat\n78.4,19.2\n');

		expect(out).toContain('FAILED');
		expect(out).toContain('parses as a date');
	});
});
