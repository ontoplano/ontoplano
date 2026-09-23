import { and, asc, eq, gt, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { apiTokens, assistantCalls } from '$lib/db/schema.js';
import { getUserSetting, setUserSetting } from '../settings.js';
import { pushToUser } from './push.js';
import { translatorFor, type Translate } from '$lib/i18n/core.js';
import { localeForUser } from '../locale.js';
import type { KeyWithValues, PlainKey } from '$lib/i18n/keys.js';

/**
 * Telling somebody what an assistant just did to their account.
 *
 * The log under Settings → Integrations is the record — one row per write,
 * with the state it replaced and a way back. This is the part that reaches
 * somebody who is not looking at it: a notification, after the assistant has
 * stopped, saying what changed and pointing at the list.
 *
 * ## One per burst, not one per call
 *
 * "Reschedule my week" is twenty tool calls. Twenty notifications for one
 * instruction is the version that gets switched off in a day, so a burst is
 * collected and said once — and the burst is considered over when the writes
 * stop rather than after a fixed interval, so a long run of them is still one
 * line.
 *
 * ## What it is allowed to cost
 *
 * The sweep runs inside the minute that already runs for reminders. No new
 * timer, no new unit on anybody's box, and a cadence that matches the quiet
 * window exactly: a burst that went quiet a minute ago is a burst this minute
 * will find.
 */

/**
 * How long the writes have to stop before the burst is said to be over.
 *
 * Sixty seconds, which is also the sweep's own interval — so in the worst case
 * somebody hears about a change two minutes after it happened, and in the
 * ordinary case just over one. Shorter than this and a slow assistant gets
 * split into several notifications; much longer and the notification stops
 * being about something that just happened.
 */
export const BURST_QUIET_SECONDS = 60;

/**
 * The most rows one notification will read.
 *
 * A runaway script can write thousands, and the difference between "changed
 * 2,000 things" and "changed 500 things" is nothing anybody acts on
 * differently. The cap keeps one bad burst from walking the whole table; the
 * count says "500+" when it bites.
 */
export const BURST_MAX_ROWS = 500;

/** Set to `off` to stop them. Absent means on: the point is knowing. */
export const ASSISTANT_PUSH_KEY = 'notify.assistant';

/** The highest call id this account has already been told about. */
const NOTIFIED_UP_TO_KEY = 'notify.assistant.upTo';

/**
 * The verb a tool's name starts with, in the past tense.
 *
 * Tool names are `verb_noun` — `add_todo`, `finish_block`, `change_habit` — so
 * the phrase can be built from the name rather than written out ninety-one
 * times and kept in step by somebody remembering to. A tool added next year
 * gets a sentence for free if it is named the way the rest are, and
 * `assistant-notify.test.ts` fails if it is not: the table is the house style,
 * written down.
 */
/*
 * The verbs a tool name can start with, as catalogue keys.
 *
 * A sentence here is assembled from a tool's own name — `add_todo` becomes
 * "added 3 todos" — which for a long time meant it could only be English: the
 * noun came from the identifier and was pluralised with an `s`, which is
 * English grammar written in TypeScript.
 *
 * It is a real sentence now, in whatever language the account reads. The verb
 * is a key rather than a word (`notify.verb.add`), the noun is a plural
 * message that carries its own count (`notify.noun.todo`), and the order of
 * the two is `notify.phrase` — which German reverses, because the participle
 * goes last there and no amount of translating the words alone would have
 * fixed that.
 *
 * `VERB_KEY` maps the first word of a tool name onto the catalogue key. Two
 * names map to the same key where the verbs are the same word.
 */
export const VERB_KEYS = new Set([
	'add',
	'apply',
	'archive',
	'cancel',
	'change',
	'close',
	'delete',
	'dismiss',
	'drop',
	'edit',
	'favorite',
	'file',
	'finish',
	'link',
	'log',
	'pay',
	'pin',
	'put',
	'recolor',
	'record',
	'remind',
	'remove',
	'rename',
	'reopen',
	'schedule',
	'set',
	'share',
	'tag',
	'tick',
	'unarchive',
	'unlink',
	'unpin',
	'unpay',
	'unschedule',
	'untick',
	'write'
]);

/**
 * The tools whose names do not start with what they do.
 *
 * `workout_done` and `cooked_recipe` read as noun-first, and splitting them on
 * the underscore gives "workouted a done" and "cookeded a recipe".
 * `note_to_todos` names where it starts and where it ends, which is the
 * clearest thing to call it and reads as nothing at all split on the
 * underscore. Named here rather than renamed: the tool names are a public
 * surface that assistants have in their saved prompts.
 */
export const PHRASE_OVERRIDES: Record<string, Phrase> = {
	workout_done: { verb: 'finish', noun: 'workout' },
	cooked_recipe: { verb: 'cooked', noun: 'recipe' },
	note_to_todos: { verb: 'madeTodosOutOf', noun: 'note' }
};

/** A verb's catalogue key, and the noun it acts on, as the identifier spells it. */
export type Phrase = { verb: string; noun: string };

/**
 * What a tool did, as a verb key and a noun.
 *
 * Returns `null` for a name this cannot read, and the caller counts those
 * under "things" rather than guessing — a wrong sentence about somebody's data
 * is worse than a vague one.
 */
export function phraseFor(tool: string): Phrase | null {
	const override = PHRASE_OVERRIDES[tool];
	if (override) return override;

	const cut = tool.indexOf('_');
	if (cut < 0) return null;

	const verb = tool.slice(0, cut);
	if (!VERB_KEYS.has(verb)) return null;

	return { verb, noun: tool.slice(cut + 1) };
}

/**
 * The nouns the catalogue has been written for.
 *
 * Derived from every writing tool's name, and listed rather than computed so
 * that adding a tool whose noun nobody translated is a thing `yarn messages
 * --check` cannot catch but this can: an unlisted noun falls back to the
 * identifier instead of rendering as a raw message key on somebody's phone.
 */
export const NOUN_KEYS = new Set([
	'activity',
	'alarm',
	'beforeBlock',
	'bill',
	'block',
	'bought',
	'dataPoint',
	'entry',
	'fromGoal',
	'goal',
	'goalArea',
	'goalProgress',
	'goalTarget',
	'habit',
	'idea',
	'inventoryCategory',
	'inventoryItem',
	'item',
	'itemAttributes',
	'ledger',
	'location',
	'movement',
	'note',
	'notebook',
	'person',
	'price',
	'recipe',
	'reminder',
	'repeatingBlock',
	'reviewNote',
	'sortRule',
	'tag',
	'toGoal',
	'todo',
	'win',
	'workout',
	'workoutCategory',
	'workoutMeasures',
	'workoutSession'
]);

/** `data_point` → `dataPoint`, which is how the catalogue spells its nouns. */
export function nounKey(noun: string): string {
	return noun.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
}

/**
 * The longest a subject's own name is allowed to be in a notification.
 *
 * Somebody's todo title can be a paragraph. A lock screen shows perhaps forty
 * characters of a title anyway, so this is about what the row in the
 * notification shade holds rather than about what looks tidy here.
 */
export const SUBJECT_MAX = 60;

/** The fields a row keeps its own name in, in the order worth trying. */
const NAME_FIELDS = ['title', 'name', 'text'] as const;

/**
 * One write, as much of it as is known.
 *
 * A plain string is a write only its tool name is known for — which is what
 * the many-case needs and all it ever reads. The object carries the two things
 * the log already stores beside the name, and they are what lets a single
 * write be named rather than counted.
 */
export type Written = string | { tool: string; args?: unknown; before?: unknown };

const toolOf = (write: Written): string => (typeof write === 'string' ? write : write.tool);

/** A string field off a JSON object, trimmed, or null for anything else. */
function stringField(value: unknown, field: string): string | null {
	if (typeof value !== 'object' || value === null) return null;
	const found = (value as Record<string, unknown>)[field];
	if (typeof found !== 'string') return null;
	const trimmed = found.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * What the thing a write was about is called, if anything says.
 *
 * `before` first, because it is the row as it stood and a rename would
 * otherwise announce the new name as though it were the old one; then the
 * arguments, which is where a create's title lives since there was no row to
 * read. Null when neither says — a reminder set by time has no name, and
 * counting it is better than inventing one.
 */
export function subjectName(write: Written): string | null {
	if (typeof write === 'string') return null;
	for (const source of [write.before, write.args])
		for (const field of NAME_FIELDS) {
			const found = stringField(source, field);
			if (found)
				return found.length > SUBJECT_MAX ? `${found.slice(0, SUBJECT_MAX - 1)}\u2026` : found;
		}
	return null;
}

/** The labels a labelling call put on and took off, as the person wrote them. */
function labelsOf(write: Written): { added: string[]; removed: string[] } {
	const list = (field: string) =>
		(stringField(typeof write === 'string' ? null : write.args, field) ?? '')
			.split(/[,\s]+/)
			.filter(Boolean);
	return { added: list('add'), removed: list('remove') };
}

/**
 * A burst of calls, as the line a person reads, in their own language.
 *
 * Grouped by what was done to what, because that is the shape of the answer
 * somebody wants: "changed 3 blocks, wrote 1 entry" rather than eleven lines.
 * The largest group leads, since with one group it is the whole sentence and
 * with several it is the one worth seeing first.
 *
 * Active voice, the same way round as the title. "3 blocks changed, 1 entry
 * wrote" was the first shape and the last two words are wrong English: a
 * passive needs the participle. One form per verb is what somebody would say
 * out loud, and it is also the form a translator can work with.
 *
 * A noun the catalogue has never heard of falls back to the identifier with
 * its underscores opened out. That is not a language, but it is a true
 * sentence about somebody's data, which is the thing that matters most here —
 * and it only happens for a tool added without its noun being added beside it.
 */
export function summarise(
	writes: Written[],
	token: string,
	t: Translate
): { title: string; body: string } {
	const groups = new Map<string, { verb: string; noun: string; count: number }>();
	let unreadable = 0;

	for (const write of writes) {
		const phrase = phraseFor(toolOf(write));
		if (!phrase) {
			unreadable += 1;
			continue;
		}
		const key = `${phrase.verb} ${phrase.noun}`;
		const seen = groups.get(key);
		if (seen) seen.count += 1;
		else groups.set(key, { ...phrase, count: 1 });
	}

	const said = (g: { verb: string; noun: string; count: number }) => {
		const key = nounKey(g.noun);
		const what = NOUN_KEYS.has(key)
			? t(`notify.noun.${key}` as KeyWithValues, { count: g.count } as never)
			: `${g.count} ${g.noun.replace(/_/g, ' ')}`;
		return { verb: t(`notify.verb.${g.verb}` as PlainKey), what };
	};

	const ordered = [...groups.values()].sort((a, b) => b.count - a.count);
	const parts = ordered.map((g) => {
		const { verb, what } = said(g);
		return t('notify.phrase', { verb, what });
	});
	if (unreadable > 0) parts.push(t('notify.others', { count: unreadable }));

	const total = writes.length;

	/*
	 * One write, and the thing it was about has a name: say the name.
	 *
	 * "labelled 1 todo" is a sentence about a shape rather than about
	 * somebody's afternoon — they have one todo in mind and the notification
	 * will not say whether it is that one. A count is the right answer for a
	 * burst, where there is no one thing to name; for a single write it is
	 * only a count because nobody looked.
	 */
	const only = total === 1 && unreadable === 0 ? writes[0] : null;
	const named = only ? subjectName(only) : null;
	if (only && named) {
		const { verb } = said(ordered[0]);
		const labels = labelsOf(only);
		const detail: string[] = [];
		if (labels.added.length > 0)
			detail.push(t('notify.labelsAs', { labels: labels.added.join(', ') }));
		if (labels.removed.length > 0)
			detail.push(t('notify.labelsOff', { labels: labels.removed.join(', ') }));
		return {
			title: t('notify.titleNamed', { who: token, verb, what: named }),
			body: detail.length > 0 ? detail.join(', ') : parts.join(', ')
		};
	}

	let title: string;
	if (ordered.length === 1 && unreadable === 0) {
		const { verb, what } = said(ordered[0]);
		title = t('notify.titleOne', { who: token, verb, what });
	} else {
		title = t('notify.titleMany', { who: token, count: total });
	}

	return { title, body: parts.join(', ') };
}

/**
 * A `created_at` as an instant, whichever of its two shapes it is in.
 *
 * The column has a `CURRENT_TIMESTAMP` default — `2026-09-14 01:39:55`, which
 * is UTC with no zone on it — and every row the app writes goes through
 * `stamp()`, which is a full ISO string ending in `Z`. Appending a `Z` to
 * whatever is there produced `…208ZZ` for the second kind, which is not a date
 * at all: the burst then looked infinitely old and was announced while the
 * assistant was still writing.
 *
 * An unreadable stamp counts as old rather than as new. It means one
 * notification that may be early; the other way round is a row that is never
 * old enough and a burst that is never said.
 */
function asInstant(stamped: string): Date {
	const parsed = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(stamped) ? stamped : `${stamped}Z`);
	return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/** One account's unsaid writes, oldest first. */
type Pending = {
	id: number;
	tool: string;
	args: string;
	/** The subject as it stood, as the log wrote it. Null for a create. */
	before: string | null;
	tokenId: number | null;
	createdAt: string;
};

/** One logged row as a write the sentence can read, its JSON opened out. */
function asWritten(row: Pending): Written {
	return { tool: row.tool, args: fromJson(row.args), before: fromJson(row.before) };
}

/** Unreadable JSON is nothing rather than a thrown sweep. */
function fromJson(text: string | null): unknown {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Where a notification opens: the log of what an assistant did, always.
 *
 * It used to work out the room a burst was about — "added 4 todos" opened the
 * todo list — and that was the wrong guess about what somebody is asking when
 * they press it: "i don't like it taking to tasks either, i wanted to go to
 * integrations in the logs of AI changes". The tasks are already where they
 * were; what a notification is about is what was done, and only the log says
 * that.
 *
 * `$lib/scroll-to-hash` is what makes the hash mean anything: the app scrolls
 * its own `main` rather than the window, so the browser's own anchor handling
 * never applied and this landed at the top of a long settings page.
 */
export const ASSISTANT_LOG_PATH = '/settings/integrations#assistant-activity';

/**
 * Every account with writes nobody has been told about, and the writes.
 *
 * One query rather than one per account: this runs every minute on a box with
 * a gigabyte, and the ordinary answer is an empty list.
 */
function pendingByAccount(limit: number): Map<string, Pending[]> {
	const rows = db
		.select({
			userId: assistantCalls.userId,
			id: assistantCalls.id,
			tool: assistantCalls.tool,
			args: assistantCalls.args,
			before: assistantCalls.before,
			tokenId: assistantCalls.tokenId,
			createdAt: assistantCalls.createdAt
		})
		.from(assistantCalls)
		.orderBy(asc(assistantCalls.id))
		.limit(limit)
		.all();

	const byAccount = new Map<string, Pending[]>();
	for (const row of rows) {
		const upTo = Number(getUserSetting(row.userId, NOTIFIED_UP_TO_KEY) ?? 0);
		if (row.id <= upTo) continue;
		const list = byAccount.get(row.userId) ?? [];
		list.push(row);
		byAccount.set(row.userId, list);
	}
	return byAccount;
}

/**
 * Who to name, for a burst that may not be one assistant's.
 *
 * Two tokens writing in the same minute is rare and attributing all of it to
 * whichever wrote last would be a false sentence about somebody's data, so a
 * mixed burst is "Assistants" rather than a name.
 */
function whoFor(calls: Pending[]): string {
	const tokens = new Set(calls.map((c) => c.tokenId));
	if (tokens.size > 1) return 'Assistants';
	return tokenName(calls[0].tokenId);
}

/** The token's name, for the sentence. Nameless or gone, it is "An assistant". */
function tokenName(tokenId: number | null): string {
	if (tokenId === null) return 'An assistant';
	const row = db
		.select({ name: apiTokens.name })
		.from(apiTokens)
		.where(eq(apiTokens.id, tokenId))
		.get();
	return row?.name?.trim() || 'An assistant';
}

export type SweepResult = {
	/** Accounts with writes waiting, whether or not one was said. */
	waiting: number;
	/** Notifications actually pushed to at least one device. */
	pushed: number;
	/** Accounts whose burst is still going, left for the next minute. */
	busy: number;
	/** Accounts that have these switched off. */
	muted: number;
};

/**
 * Say what the assistants did, to whoever is not watching.
 *
 * Called from the minute that already runs. Never throws: a notification that
 * can break the reminder sweep beside it is worse than a notification that
 * does not arrive, which is the same rule the log itself follows.
 */
export async function notifyAssistantBursts(now = new Date()): Promise<SweepResult> {
	const result: SweepResult = { waiting: 0, pushed: 0, busy: 0, muted: 0 };
	const quietBefore = new Date(now.getTime() - BURST_QUIET_SECONDS * 1000);

	for (const [userId, calls] of pendingByAccount(BURST_MAX_ROWS)) {
		result.waiting += 1;

		/*
		 * Still writing? Leave the whole burst alone.
		 *
		 * Said the moment the newest write is older than the quiet window, so
		 * an assistant halfway through a long run is one notification when it
		 * finishes rather than one per minute while it works.
		 */
		const newest = calls[calls.length - 1];
		if (asInstant(newest.createdAt) > quietBefore) {
			result.busy += 1;
			continue;
		}

		// Marked as said either way: somebody who turned these off is not owed
		// a backlog of them the day they turn them on.
		setUserSetting(userId, NOTIFIED_UP_TO_KEY, String(newest.id));

		if ((getUserSetting(userId, ASSISTANT_PUSH_KEY) ?? 'on') === 'off') {
			result.muted += 1;
			continue;
		}

		/*
		 * The account's own language, not the caller's.
		 *
		 * The assistant that made these writes may be running anywhere and in
		 * any language; the person reading the notification is the one whose
		 * setting counts. Same rule as a reminder — see `$lib/server/locale`.
		 */
		const { title, body } = summarise(
			calls.map(asWritten),
			whoFor(calls),
			await translatorFor(localeForUser(userId))
		);

		const outcome = await pushToUser(userId, {
			title,
			body,
			// The log, not the room the writes landed in — see above.
			url: ASSISTANT_LOG_PATH,
			// One tag, so a second burst replaces the first on the lock screen
			// rather than stacking up behind it.
			tag: 'assistant-activity'
		});
		if (outcome.sent > 0) result.pushed += 1;
	}

	return result;
}

/**
 * Start somebody's counter at the newest call there is.
 *
 * For an account that has never had one of these: without it, switching the
 * notifications on would send a summary of everything an assistant has ever
 * done. Used when the preference is turned on.
 */
export function catchUp(userId: string): void {
	const newest = db
		.select({ id: sql<number>`max(${assistantCalls.id})` })
		.from(assistantCalls)
		.where(and(eq(assistantCalls.userId, userId), gt(assistantCalls.id, 0)))
		.get();
	setUserSetting(userId, NOTIFIED_UP_TO_KEY, String(newest?.id ?? 0));
}
