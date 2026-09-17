/**
 * The time on the wire, and the two things that book an alarm from it.
 *
 * `upcomingReminders` is read by both: the shell's ringer, which is Java and
 * parses by hand, and the copy of the app that books its own alarms. Neither
 * shares a type with the service, and both broke on the same change — the day
 * `remindAt` became a wall clock in the account's zone instead of an instant.
 *
 * The ringer's parser requires a trailing `Z`, so every reminder came back as
 * the epoch and was skipped: a phone pointed at a server rang for nothing at
 * all, silently, and nothing anywhere said why. The other side parsed the same
 * string as the *device's* wall clock, which is right only while the device
 * sits in the account's zone.
 *
 * So the list carries `at` — the moment, as a moment — and this is what holds
 * the three of them together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { instantOfLocal } from '../src/lib/services/time';

const RINGER = 'capacitor/android/app/src/main/java/app/ontoplano/isolated/Ringer.java';

/** What the service puts on the wire, for an account three hours west of UTC. */
const WALL = '2026-09-17T18:00:00';
const TZ = 'America/Sao_Paulo';
const AT = instantOfLocal(WALL, TZ).toISOString();

describe('the instant a reminder goes off', () => {
	test('is the account wall clock, resolved through the account zone', () => {
		expect(AT).toBe('2026-09-17T21:00:00.000Z');
	});

	/*
	 * The ringer's shapes, read out of the Java rather than restated here —
	 * a copy of them in this file would agree with itself while the phone
	 * stayed silent.
	 */
	test('is a shape the shell can parse', () => {
		const java = readFileSync(RINGER, 'utf8');
		const shapes = /String\[\] shapes = \{([^}]*)\}/.exec(java);
		expect(shapes, `no shapes in ${RINGER}`).not.toBe(null);

		const accepted = [...shapes![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		expect(accepted.length).toBeGreaterThan(0);

		/*
		 * The Java patterns, as regular expressions. One pass, because
		 * substituting the quoted parts first and the letter runs afterwards
		 * lets the second pass eat the `T` and `Z` the first one just put in.
		 */
		const asRegex = (shape: string) => {
			let out = '';
			for (let i = 0; i < shape.length; ) {
				if (shape[i] === "'") {
					const end = shape.indexOf("'", i + 1);
					out += shape.slice(i + 1, end).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					i = end + 1;
				} else if (/[A-Za-z]/.test(shape[i])) {
					let run = 0;
					while (shape[i + run] === shape[i]) run++;
					out += `\\d{${run}}`;
					i += run;
				} else {
					out += shape[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
					i++;
				}
			}
			return new RegExp(`^${out}$`);
		};

		expect(accepted.some((shape) => asRegex(shape).test(AT))).toBe(true);
	});

	test('is what the ringer reads, with the wall clock only as a fallback', () => {
		const java = readFileSync(RINGER, 'utf8');
		// `at` first: an instance new enough to send it is not guessed about.
		expect(java).toMatch(/instant\(one\.optString\("at"/);
		expect(java).toMatch(/wallClock\(one\.optString\("remindAt"/);
	});
});
