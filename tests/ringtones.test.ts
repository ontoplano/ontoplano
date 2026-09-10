/**
 * Sounds, and the rule that nothing makes one unless it was asked to.
 *
 * An app that beeps the first time you use it is an app whose sound gets
 * turned off and never turned back on, so silence is the default for every
 * kind of reminder. The limits matter too: ten sounds at 300 KB is a bound
 * somebody can hit by accident with one long file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	ringtones: typeof import('../src/lib/server/services/ringtones');
	reminders: typeof import('../src/lib/server/services/reminders');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

const bytes = (n: number) => new Uint8Array(n).fill(1);

beforeAll(async () => {
	s = {
		ringtones: await import('../src/lib/server/services/ringtones'),
		reminders: await import('../src/lib/server/services/reminders')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-24T09:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('uploading a sound', () => {
	test('an mp3 within the limit is kept, and comes back', () => {
		const id = s.ringtones.addRingtone(ctx, {
			name: 'Chimes',
			mime: 'audio/mpeg',
			data: bytes(2048)
		});
		const mine = s.ringtones.listRingtones(ctx);
		expect(mine.map((r) => r.name)).toContain('Chimes');
		expect(s.ringtones.readRingtone(ctx, id).mime).toBe('audio/mpeg');
	});

	test('something that is not audio is refused, saying what is accepted', () => {
		expect(() =>
			s.ringtones.addRingtone(ctx, { name: 'Sneaky', mime: 'application/zip', data: bytes(10) })
		).toThrow(/MP3, OGG or WAV/);
	});

	test('too big is refused, and says how big it was', () => {
		expect(() =>
			s.ringtones.addRingtone(ctx, {
				name: 'Symphony',
				mime: 'audio/mpeg',
				data: bytes(s.ringtones.MAX_RINGTONE_BYTES + 1)
			})
		).toThrow(/KB/);
	});

	test('an empty file is refused rather than stored as silence', () => {
		expect(() =>
			s.ringtones.addRingtone(ctx, { name: 'Nothing', mime: 'audio/wav', data: bytes(0) })
		).toThrow();
	});

	test('two with the same name is refused, because the list is chosen from by name', () => {
		expect(() =>
			s.ringtones.addRingtone(ctx, { name: 'Chimes', mime: 'audio/mpeg', data: bytes(64) })
		).toThrow(/already have a sound/);
	});

	test('the eleventh is refused', () => {
		for (let i = 2; i <= s.ringtones.MAX_RINGTONES; i++) {
			s.ringtones.addRingtone(ctx, { name: `Tone ${i}`, mime: 'audio/ogg', data: bytes(32) });
		}
		expect(() =>
			s.ringtones.addRingtone(ctx, { name: 'One too many', mime: 'audio/ogg', data: bytes(32) })
		).toThrow(new RegExp(`${s.ringtones.MAX_RINGTONES} sounds already`));
	});

	test("and one account's sounds are invisible to another", () => {
		expect(s.ringtones.listRingtones(theirs)).toHaveLength(0);
		const mine = s.ringtones.listRingtones(ctx)[0];
		expect(() => s.ringtones.readRingtone(theirs, mine.id)).toThrow();
	});
});

describe('what makes a sound', () => {
	test('every kind starts silent', () => {
		for (const choice of s.ringtones.soundChoices(ctx)) {
			expect(choice.audible, choice.kind).toBe(false);
		}
	});

	test('a kind switched on plays the app’s own sound until told otherwise', () => {
		s.ringtones.setSoundChoice(ctx, 'free', { audible: true, ringtoneId: null });
		const sound = s.ringtones.soundFor(ctx, {
			subjectKind: 'free',
			audible: null,
			ringtoneId: null
		});
		expect(sound?.url).toBe(s.ringtones.DEFAULT_RINGTONE_URL);
	});

	test('and one of yours once you choose it', () => {
		const tone = s.ringtones.listRingtones(ctx)[0];
		s.ringtones.setSoundChoice(ctx, 'free', { audible: true, ringtoneId: tone.id });
		const sound = s.ringtones.soundFor(ctx, {
			subjectKind: 'free',
			audible: null,
			ringtoneId: null
		});
		expect(sound?.url).toBe(`/api/ringtones/${tone.id}`);
	});

	test('a reminder that says no is silent however loud its kind is', () => {
		expect(
			s.ringtones.soundFor(ctx, { subjectKind: 'free', audible: false, ringtoneId: null })
		).toBeNull();
	});

	test('and one that says yes rings even where its kind does not', () => {
		expect(
			s.ringtones.soundFor(ctx, { subjectKind: 'bill', audible: true, ringtoneId: null })?.url
		).toBe(s.ringtones.DEFAULT_RINGTONE_URL);
		expect(
			s.ringtones.soundFor(ctx, { subjectKind: 'bill', audible: null, ringtoneId: null })
		).toBeNull();
	});

	test('somebody else’s sound cannot be chosen, and is not quietly accepted', () => {
		const mine = s.ringtones.listRingtones(ctx)[0];
		s.ringtones.setSoundChoice(theirs, 'free', { audible: true, ringtoneId: mine.id });
		const chosen = s.ringtones.soundChoices(theirs).find((c) => c.kind === 'free');
		expect(chosen?.ringtoneId).toBeNull();
	});

	test('a removed sound leaves the kind audible on the default rather than broken', () => {
		const tone = s.ringtones.listRingtones(ctx).find((t) => t.name === 'Tone 2')!;
		s.ringtones.setSoundChoice(ctx, 'todo', { audible: true, ringtoneId: tone.id });
		s.ringtones.removeRingtone(ctx, tone.id);

		const sound = s.ringtones.soundFor(ctx, {
			subjectKind: 'todo',
			audible: null,
			ringtoneId: null
		});
		expect(sound?.url).toBe(s.ringtones.DEFAULT_RINGTONE_URL);
	});
});

/**
 * A free reminder names its sound by id, and the id arrives from a form.
 * `setSoundChoice` always checked whose sound that is; the free-reminder
 * path took the number on faith (an I1 letter-violation — the read side is
 * scoped, so it never played, but the foreign id sat in the row).
 */
describe('a reminder naming a sound', () => {
	test("somebody else's ringtone id is dropped, not stored", async () => {
		const reminders = await import('../src/lib/server/services/reminders');
		const { db } = await import('../src/lib/server/db');
		const schema = await import('../src/lib/server/db/schema');
		const { eq } = await import('drizzle-orm');

		const mine = s.ringtones.addRingtone(ctx, {
			name: 'Coveted',
			mime: 'audio/mpeg',
			data: bytes(512)
		});

		const id = reminders.createFreeReminder(theirs, {
			at: '2026-08-24T18:00:00',
			message: 'ring with a borrowed bell',
			ringtoneId: mine
		});

		const row = db
			.select({ ringtoneId: schema.reminders.ringtoneId })
			.from(schema.reminders)
			.where(eq(schema.reminders.id, id))
			.get();
		expect(row?.ringtoneId).toBeNull();
	});
});
