#!/usr/bin/env node
/**
 * The floor and the poll are one fact in two languages.
 *
 * `REMINDER_LEAD_MINUTES` refuses a reminder the phone could not hear about in
 * time; `REFRESH_MS` in the shell is how long that is. They are the same
 * number for the same reason, and they live either side of a gap nothing
 * type-checks across — so the only thing that can keep them together is a
 * check that fails when they come apart.
 *
 * TypeScript is the source. If this fires, move the Java to match it.
 *
 *   node scripts/check-reminder-window.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOOR = 'src/lib/reminder-window.ts';
const RINGER = 'capacitor/android/app/src/main/java/app/ontoplano/isolated/Ringer.java';

const read = (where, pattern, what) => {
	const found = readFileSync(join(ROOT, where), 'utf8').match(pattern);
	if (!found) {
		console.error(`${where} no longer states ${what}.`);
		process.exit(1);
	}
	return found;
};

const minutes = Number(
	read(FLOOR, /export const REMINDER_LEAD_MINUTES = (\d+);/, 'REMINDER_LEAD_MINUTES')[1]
);

// `15 * 60 * 1000L` — the two factors are the shape it is written in, and
// reading them rather than the product is what keeps this honest about units.
const [, every, unit] = read(
	RINGER,
	/private static final long REFRESH_MS = (\d+) \* (\d+) \* 1000L;/,
	'REFRESH_MS'
);

const ringerMinutes = (Number(every) * Number(unit)) / 60;

if (ringerMinutes !== minutes) {
	console.error(
		`reminders: the floor is ${minutes} minutes and the phone asks every ${ringerMinutes}.\n` +
			`  They are the same fact — a reminder set inside the floor is one the phone\n` +
			`  cannot hear about in time.\n` +
			`  ${FLOOR} is the source; move REFRESH_MS in Ringer.java to match.`
	);
	process.exit(1);
}

console.log(`reminders: the floor and the phone's poll agree on ${minutes} minutes`);
