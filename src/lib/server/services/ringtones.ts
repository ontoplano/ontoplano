import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { reminderSounds, ringtones } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { REMINDER_KINDS, type ReminderKind } from './reminders.js';
import { stamp, stamps } from './time.js';
import { str } from './validate.js';

/**
 * The sounds a reminder can make.
 *
 * Every reminder shows. Only the ones somebody asked to hear make a noise —
 * an app that beeps the first time you use it is an app whose sound you turn
 * off and never turn back on. So silence is the default for every kind, and
 * audible is a thing you switch on for the kinds that are worth interrupting
 * you: an alarm, probably; a birthday, probably not.
 */

/** Three hundred kilobytes. Long enough for a ringtone, short enough for ten. */
export const MAX_RINGTONE_BYTES = 300 * 1024;

/** Ten each. A list you scroll to choose from is not a list of ringtones. */
export const MAX_RINGTONES = 10;

/**
 * What a browser will actually play.
 *
 * Deliberately narrow: these three are the formats every browser this app runs
 * in can decode, and accepting a fourth means somebody uploads a file that
 * uploads fine and then never makes a sound.
 */
export const RINGTONE_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav'] as const;

/** The one that ships with the app, served as a static file. */
export const DEFAULT_RINGTONE_URL = '/sounds/reminder.mp3';

export type Ringtone = { id: number; name: string; mime: string; bytes: number };

export function listRingtones(ctx: Ctx): Ringtone[] {
	return db
		.select({
			id: ringtones.id,
			name: ringtones.name,
			mime: ringtones.mime,
			bytes: ringtones.bytes
		})
		.from(ringtones)
		.where(eq(ringtones.userId, ctx.userId))
		.orderBy(asc(ringtones.name))
		.all();
}

/** The bytes themselves, for the route that plays one. Owned or nothing. */
export function readRingtone(ctx: Ctx, id: number): { mime: string; data: Buffer } {
	const row = db
		.select({ mime: ringtones.mime, data: ringtones.data })
		.from(ringtones)
		.where(and(eq(ringtones.id, id), eq(ringtones.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('ringtone');
	return { mime: row.mime, data: Buffer.from(row.data as Uint8Array) };
}

export function addRingtone(
	ctx: Ctx,
	input: { name: unknown; mime: unknown; data: Uint8Array }
): number {
	const name = str(input.name, 'name', { max: 60 });
	const mime = String(input.mime ?? '');

	if (!(RINGTONE_TYPES as readonly string[]).includes(mime)) {
		throw new ValidationError('That is not a sound file this app can play — MP3, OGG or WAV.');
	}
	if (input.data.byteLength === 0) throw new ValidationError('That file is empty.');
	if (input.data.byteLength > MAX_RINGTONE_BYTES) {
		throw new ValidationError(
			`That is ${Math.round(input.data.byteLength / 1024)} KB. The limit is ${MAX_RINGTONE_BYTES / 1024} KB.`
		);
	}

	const held = db
		.select({ id: ringtones.id })
		.from(ringtones)
		.where(eq(ringtones.userId, ctx.userId))
		.all().length;
	if (held >= MAX_RINGTONES) {
		throw new ValidationError(
			`You have ${MAX_RINGTONES} sounds already — remove one before adding another.`
		);
	}

	const taken = db
		.select({ id: ringtones.id })
		.from(ringtones)
		.where(and(eq(ringtones.userId, ctx.userId), eq(ringtones.name, name)))
		.get();
	if (taken) throw new ValidationError(`You already have a sound called "${name}".`);

	return db
		.insert(ringtones)
		.values({
			userId: ctx.userId,
			name,
			mime,
			bytes: input.data.byteLength,
			data: Buffer.from(input.data)
		})
		.returning({ id: ringtones.id })
		.get().id;
}

export function removeRingtone(ctx: Ctx, id: number): void {
	const gone = db
		.delete(ringtones)
		.where(and(eq(ringtones.id, id), eq(ringtones.userId, ctx.userId)))
		.run();
	if (gone.changes === 0) throw new NotFoundError('ringtone');
}

export type SoundChoice = { kind: ReminderKind; audible: boolean; ringtoneId: number | null };

/**
 * What every kind sounds like, including the ones never chosen.
 *
 * A kind with no row is silent, and returning the full set rather than what
 * happens to be stored means the page renders the same shape whether somebody
 * has touched this or not.
 */
export function soundChoices(ctx: Ctx): SoundChoice[] {
	const rows = db
		.select({
			kind: reminderSounds.kind,
			audible: reminderSounds.audible,
			ringtoneId: reminderSounds.ringtoneId
		})
		.from(reminderSounds)
		.where(eq(reminderSounds.userId, ctx.userId))
		.all();

	const byKind = new Map(rows.map((r) => [r.kind, r]));
	return REMINDER_KINDS.map((kind) => {
		const row = byKind.get(kind);
		return {
			kind,
			audible: row?.audible ?? false,
			ringtoneId: row?.ringtoneId ?? null
		};
	});
}

export function setSoundChoice(
	ctx: Ctx,
	kind: unknown,
	choice: { audible: boolean; ringtoneId: number | null }
): void {
	const wanted = String(kind ?? '');
	if (!(REMINDER_KINDS as readonly string[]).includes(wanted)) {
		throw new ValidationError('That is not a kind of reminder.');
	}

	// A sound belonging to somebody else is not a sound: checked rather than
	// trusted, because the id arrives from a form.
	const ringtoneId =
		choice.ringtoneId === null
			? null
			: (db
					.select({ id: ringtones.id })
					.from(ringtones)
					.where(and(eq(ringtones.id, choice.ringtoneId), eq(ringtones.userId, ctx.userId)))
					.get()?.id ?? null);

	const where = and(eq(reminderSounds.userId, ctx.userId), eq(reminderSounds.kind, wanted));
	const existing = db.select({ id: reminderSounds.id }).from(reminderSounds).where(where).get();

	if (existing) {
		db.update(reminderSounds)
			.set({ audible: choice.audible, ringtoneId, updatedAt: stamp(ctx) })
			.where(where)
			.run();
	} else {
		db.insert(reminderSounds)
			.values({
				...stamps(ctx),
				userId: ctx.userId,
				kind: wanted,
				audible: choice.audible,
				ringtoneId
			})
			.run();
	}
}

/**
 * What this particular reminder should sound like, if anything.
 *
 * The reminder's own answer wins where it has one — an alarm set for one
 * morning is audible whatever free reminders do in general — and otherwise it
 * is whatever its kind says. `null` means show it and say nothing.
 */
export function soundFor(
	ctx: Ctx,
	reminder: { subjectKind: ReminderKind; audible: boolean | null; ringtoneId: number | null }
): { url: string } | null {
	if (reminder.audible === false) return null;

	let audible = reminder.audible === true;
	let ringtoneId = reminder.ringtoneId;

	if (!audible || ringtoneId === null) {
		const kind = soundChoices(ctx).find((c) => c.kind === reminder.subjectKind);
		if (!audible) audible = kind?.audible ?? false;
		if (ringtoneId === null) ringtoneId = kind?.ringtoneId ?? null;
	}

	if (!audible) return null;
	return { url: ringtoneId === null ? DEFAULT_RINGTONE_URL : `/api/ringtones/${ringtoneId}` };
}
