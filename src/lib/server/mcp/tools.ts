/**
 * What an assistant can do in here, and what it has to hold to do it.
 *
 * Every tool is one entry: a name, the sentence a model reads to decide whether
 * this is the thing it wants, the shape of its arguments, the scope the token
 * must carry, and a handler that calls the same service function the web page
 * calls. Nothing here talks to the database, and nothing here reimplements a
 * rule — the ceilings, the validation and the ownership are the service's, so a
 * tool cannot be a way around them.
 *
 * Two habits keep this honest:
 *
 * **The description is written for a model that has never seen this app.** It
 * says what the thing is in this app's own vocabulary — a notebook is a subject
 * you write against, a todo is a task with no date yet — because a tool called
 * `create_entry` with the description "creates an entry" is a tool that gets
 * called for the wrong reasons.
 *
 * **Reading and writing are different scopes.** A token granted `notes:read`
 * that calls a tool needing `notes:write` is refused, and the refusal names the
 * scope it lacked rather than saying no.
 */
import { localDateOf, type Ctx } from '$lib/services/ctx.js';
import type { Scope } from '../services/tokens.js';
import type { Ref, RefKind } from './refs.js';
import { CLOSED_STATUSES, STATUSES } from '../../task-status.js';
import { compareByPriority } from '../../ratings.js';
import type { Confinement } from './confinement.js';
import { mayReadFile } from '$lib/services/media-permission.js';
import { pictureReferrers, recordingReferrers } from '$lib/services/media-referrers.js';
import { read as readPicture } from '$lib/services/media.js';
import { read as readRecording } from '$lib/services/audio.js';

import {
	archiveEntry,
	createEntry,
	getEntry,
	listEntries,
	pinEntry,
	updateEntry
} from '$lib/services/diary.js';
import { makeTodosFromEntry } from '$lib/services/note-todos.js';
import { createActivity, listActivities, updateActivity } from '$lib/services/activities.js';
import { createHabit, listHabits, updateHabit, HABIT_TYPES } from '$lib/services/habits.js';
import {
	createFreeReminder,
	editReminder,
	createReminder,
	deleteReminder,
	dismissReminder,
	listReminders
} from '$lib/services/reminders.js';
import { createPerson, listPeople, updatePerson } from '$lib/services/people.js';
import { RELATIONSHIPS } from '../../people.js';
import { listWins, saveWins, WINS_PER_DAY } from '$lib/services/wins.js';
import { readWeek, saveNote, weekStartOf, readNote } from '$lib/services/review.js';
import {
	getStreamBySlug,
	listStreams,
	pushPoints,
	serialiseStream
} from '$lib/services/streams.js';
import { createSlot, deleteSlots, listWeeklySlots, updateSlot } from '$lib/services/slots.js';
import {
	describeRecurrence,
	formatDate as recFormatDate,
	MAX_INTERVAL,
	parseRecurrence,
	serialiseRecurrence
} from '../../recurrence.js';
import { translator } from '../../i18n/core.js';
import { messages as englishMessages } from '../../i18n/catalogues/en.js';
import {
	createIdea,
	deleteIdea,
	listIdeas,
	toggleApplied,
	toggleFavorite,
	updateIdea
} from '$lib/services/ideas.js';
import {
	deleteTag,
	describeTag,
	recolorTag,
	renameTag,
	tagsInNotebook,
	tagsWithUses
} from '$lib/services/tags.js';
import {
	addGoalLinks,
	addGoalTarget,
	closeGoal,
	createArea,
	createGoal,
	listAreas,
	listGoals,
	removeGoalLinks,
	removeGoalTarget,
	setTargetProgress,
	updateGoal,
	type GoalTarget
} from '$lib/services/goals.js';
import {
	contentsOf,
	createNotebook,
	deleteNotebook,
	getNotebook,
	listNotebooks,
	setNotebookShared,
	updateNotebook
} from '$lib/services/notebooks.js';
import {
	cooked,
	createRecipe,
	getRecipe,
	importIngredients,
	ingredientsOf,
	listRecipes,
	setArchived,
	updateRecipe
} from '$lib/services/recipes.js';
import {
	listWorkouts,
	getWorkout,
	createWorkout,
	updateWorkout,
	setArchived as setWorkoutArchived,
	done as workoutDone,
	listWorkoutCategories,
	createWorkoutCategory,
	deleteWorkoutCategory,
	setWorkoutMeasures,
	deleteSession,
	getSession,
	listSessions,
	countSessions,
	logWorkout,
	measureHistory,
	measuredActivities,
	updateSession
} from '$lib/services/workouts.js';
import {
	listBills,
	getBill,
	createBill,
	updateBill,
	setArchived as setBillArchived,
	markPaid,
	unmarkPaid,
	listPayments,
	monthSummary,
	billsDueBetween
} from '$lib/services/bills.js';
import {
	categorySlices,
	createRule,
	deleteRule,
	listMovements,
	listRules,
	monthlyTotals,
	recordMovement,
	updateRule
} from '$lib/services/statements.js';
import { createLedger, listLedgers } from '$lib/services/ledgers.js';
import { grouped, search } from '$lib/services/search.js';
import {
	createCategory as createInventoryCategory,
	createItem,
	deleteCategory as deleteShoppingCategory,
	deleteItem,
	listItems,
	listCategories as listInventoryCategories,
	recordPaid,
	renameCategory,
	setBought,
	setCategoryFood,
	setCategoryShared,
	setSnoozed,
	setItemCategory
} from '$lib/services/inventory.js';
import { getTodayBoard } from '$lib/services/today.js';
import {
	archiveTodo,
	createTodo,
	tagTodo,
	deleteTodo,
	listTodos,
	scheduleTodo,
	setTodoStatus,
	updateTodo,
	type Todo
} from '$lib/services/todos.js';
import { getUpcomingSchedule } from '$lib/services/schedule.js';
import { createExceptional } from '$lib/services/slots.js';
import {
	cancelOccurrence,
	changeOccurrence,
	recordIdOf,
	setOccurrenceStatus
} from '$lib/services/instances.js';
import { listCategories } from '$lib/services/activities.js';
import { listOccurrences, toggleOccurrence } from '$lib/services/habits.js';
import {
	locationTree,
	createLocation,
	updateLocation,
	deleteLocation,
	getLocation,
	pathOf
} from '$lib/services/locations.js';
import {
	setItemLocation,
	setItemAttributes,
	listItems as listInventoryItems
} from '$lib/services/inventory.js';
import { NotFoundError, ValidationError } from '$lib/services/errors.js';
import { passesTagFilter, TAG_MODES, type TagFilter, type TagMode } from '$lib/tag-filter.js';

/** JSON Schema, the subset a tool's arguments actually use. */
type Shape = {
	type: 'object';
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: false;
};

export type Tool = {
	name: string;
	title: string;
	description: string;
	scope: Scope;
	/**
	 * Scopes any one of which is enough, instead of `scope` alone.
	 *
	 * One tool needs this and it is not an exception being carved out: a file
	 * answers to whatever refers to it, so a picture in a note wants
	 * `notes:read` and the same tool fetching one off a task wants
	 * `tasks:read`. Demanding a single scope would hide `media` from a key
	 * that is entitled to exactly the files it is asking for. `scope` stays
	 * the one the manifest records and the one a refusal names first.
	 */
	anyScope?: Scope[];
	/** Whether calling it changes anything, which is what a client warns about. */
	writes: boolean;
	/**
	 * Whether calling it removes a row for good. A wrong write is data that is
	 * wrong; a wrong delete is data that is gone — so these need the
	 * `destructive` grant on top of the room's own write scope.
	 */
	destroys?: boolean;
	/**
	 * A second scope the token must also hold.
	 *
	 * For a tool that reaches across two rooms: making todos out of a note
	 * reads the note and writes to the task list, and holding one of those
	 * grants is not consent to the other. Without it, a token given only
	 * `tasks:write` could copy a note it was never allowed to read into a
	 * todo, and then read the todo.
	 */
	alsoNeeds?: Scope;
	/**
	 * Whether the answer leaves out the row it changed.
	 *
	 * Every write answers with `before` and `after` so a wrong call is
	 * reversible from the transcript. On a tool whose whole subject is one
	 * small field, that is two complete copies of a task to say one label
	 * moved — most of what tagging costs, for something the tool's own answer
	 * already states. The person's copy in the assistant log is unaffected:
	 * that is where a real undo comes from.
	 */
	quiet?: boolean;
	/**
	 * The version that announced this tool is going away — set one release
	 * before a removal, never in the same one. The manifest check refuses a
	 * removal that was not announced; see `manifest.ts` for the whole rule.
	 * A parameter is deprecated the same way, with `deprecated: true` in its
	 * schema entry and the replacement named in its description.
	 */
	deprecated?: string;
	input: Shape;
	/**
	 * Which arguments name a thing, and what kind of thing.
	 *
	 * An id in an argument is a reach into a table, and what has kept those
	 * reaches inside one account is that each service filters by `user_id`
	 * itself, in every query it writes. Declaring the reach instead moves that
	 * from a habit to a mechanism: the dispatcher resolves the id among the
	 * rows this caller can already list, so a number belonging to somebody else
	 * never arrives at `run` at all. See `refs.ts` for the kinds.
	 *
	 * It is also what makes a token confined to one notebook possible: narrow
	 * the kind's list once and every tool naming that kind narrows with it.
	 */
	refs?: Ref[];
	/**
	 * This tool decides the confinement itself, so a confined key is offered it.
	 *
	 * A confined key is normally shown only the tools that name a kind its
	 * confinement holds — which works because naming an id is how a tool
	 * reaches anything. `media` does not name an id: it takes the link as the
	 * writing spells it, `/media/12`, and works out what may be read from what
	 * refers to the file. Judged by the usual rule it declares no reach, so it
	 * was hidden from every confined key — while the confinement screen
	 * promised "its tasks, its goals, its notes, and the pictures and
	 * recordings in them". The pictures were the one part that did not arrive,
	 * and an assistant asked to look at a screenshot in the notebook it was
	 * given could only report that it had no such tool.
	 *
	 * So: a tool sets this when its own `run` applies the confinement — here,
	 * `mayReadFile`, which answers for a file in this notebook and refuses one
	 * anywhere else. It is a statement about the tool, not an exemption: a
	 * tool that sets it and does not check is a hole, which is why there is a
	 * test that a confined key is refused a file outside its notebook.
	 */
	confinesItself?: boolean;
	/**
	 * The row this call is about, as it stands — read before and after every
	 * write, so the answer carries `before` and `after` and a bad call is
	 * reversible from the transcript. On a tool that changes an existing thing
	 * this is that thing; on a delete it is the whole row, so it can be put
	 * back from the answer alone. A create has no subject: there was nothing
	 * there, and the protocol layer answers `before: null` for it.
	 */
	subject?: (ctx: Ctx, args: Record<string, unknown>) => unknown;
	/**
	 * What this call brings into being, so the id it answers with can be read
	 * back.
	 *
	 * An id in an answer has to mean a row that is there. It did not once: an
	 * `add_todo` answered `{ id: 559 }`, and a minute later nothing by that
	 * number existed — so the caller went to label its own work, was told the
	 * task was not found, and the work was gone with nothing anywhere saying
	 * so. Set this and the protocol layer reads the row back through the same
	 * registry that resolves an id somebody passed in: `after` carries the
	 * thing that was made, and a create that made nothing readable is an
	 * error rather than a number.
	 */
	creates?: RefKind;
	/**
	 * `caller` is the connection's own grants, for the one rule that cannot be
	 * decided from the arguments: which files this key may see. Every other
	 * tool ignores it — the scopes were already checked before `run`.
	 */
	run: (ctx: Ctx, args: Record<string, unknown>, caller?: ToolCaller) => unknown;
};

/** What a tool may know about who is calling it. */
export type ToolCaller = {
	scopes: readonly string[];
	confinement?: Confinement | null;
};

const object = (properties: Record<string, unknown>, required: string[] = []): Shape => ({
	type: 'object',
	properties,
	required,
	additionalProperties: false
});

const text = (description: string) => ({ type: 'string', description });
const count = (description: string, fallback: number) => ({
	type: 'integer',
	description,
	default: fallback
});

/** A day, as this app writes one. Rejected early so a service never sees junk. */
function day(value: unknown, what: string): string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new ValidationError(`${what} has to be a date like 2026-03-14.`);
	return value;
}

function limitOf(args: Record<string, unknown>, fallback: number, ceiling = 200): number {
	const raw = Number(args.limit ?? fallback);
	if (!Number.isFinite(raw) || raw < 1) return fallback;
	return Math.min(Math.floor(raw), ceiling);
}

function offsetOf(args: Record<string, unknown>): number {
	const raw = Number(args.offset ?? 0);
	if (!Number.isFinite(raw) || raw < 1) return 0;
	return Math.floor(raw);
}

/** The `offset` every capped list takes, so what the cap left behind is reachable. */
const from = (what: string) => ({
	type: 'integer',
	description: `Skip this many before counting, so the rest of ${what} can be read a page at a time. \`nextOffset\` on the answer is what to pass here next.`,
	default: 0
});

/**
 * A slice of a list, saying what it left behind.
 *
 * `count` was the length of the slice and nothing else, so a tool capped at
 * fifty answered `count: 50` whether the account held fifty rows or five
 * hundred. A reader has no way to tell those apart, and the one it guesses is
 * that it has been handed everything — which is how a list that was merely
 * cut short came to look like a list that had stopped being updated.
 *
 * So the answer carries the whole size beside the piece of it: `total` is what
 * matched, `count` is what is here, and `remaining` and `nextOffset` appear
 * only when there is more, because a reader that sees neither has been told
 * there is nothing left.
 */
function pageOf<T>(
	items: T[],
	total: number,
	offset: number,
	key = 'items'
): Record<string, unknown> {
	const seen = offset + items.length;
	const out: Record<string, unknown> = { [key]: items, count: items.length, total };
	if (offset > 0) out.offset = offset;
	if (seen < total) {
		out.remaining = total - seen;
		out.nextOffset = seen;
	}
	return out;
}

/** The in-memory case: the whole list is already here, so the cap is a slice. */
function paged<T>(
	rows: T[],
	args: Record<string, unknown>,
	fallback: number
): Record<string, unknown> {
	const limit = limitOf(args, fallback);
	const offset = Math.min(offsetOf(args), rows.length);
	return pageOf(rows.slice(offset, offset + limit), rows.length, offset);
}

/**
 * How much of a row to send, and which parts.
 *
 * Every answer here is read by a model with a budget, and the default was the
 * whole row: reading one notebook's task list cost about ten thousand tokens
 * of which a tenth was used. So a listing answers with a line by default —
 * enough to know which thing it is and whether it is done — and the rest is
 * asked for.
 *
 * Three levels, because two were not enough in practice:
 *
 * - **the default**, a line: what it is, what state it is in, its labels;
 * - **`verbose`**, the whole row as it was before this existed;
 * - **`fields`**, exactly the ones named, for a caller that wants two.
 *
 * `fields` is checked against the keys the shape can produce and refuses
 * anything else by name. Nothing a caller sends reaches a query — the filters
 * and the shaping run over rows a service has already scoped to this account
 * — and this keeps it that way by construction rather than by trust.
 */
type Detail = { verbose: boolean; fields: string[] | null };

const DETAIL_ARGS = {
	verbose: {
		type: 'boolean',
		description:
			'Send the whole of each row rather than a line. Off by default: a list is usually read to find something, and the thing found is then asked about by id.'
	},
	fields: text(
		'Only these parts of each row, comma-separated — `title,status,tags`. `id` always comes back. Unknown names are refused rather than ignored.'
	)
};

function detailOf(args: Record<string, unknown>): Detail {
	const asked = args.fields;
	if (asked === undefined || asked === null || asked === '')
		return { verbose: args.verbose === true, fields: null };

	const names = (Array.isArray(asked) ? asked : String(asked).split(','))
		.map((one) => String(one).trim())
		.filter(Boolean);
	return { verbose: args.verbose === true, fields: names };
}

/** A shaped row without the keys it holds nothing under. */
function present(row: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

/**
 * One row, cut to what was asked for.
 *
 * `full` is everything this kind of thing can say; `line` is the handful that
 * identifies it. Both are built with every key they can carry, set to
 * `undefined` where this row has nothing — so the names a caller may ask for
 * are the shape's, not whichever this particular row happens to fill, and a
 * task with no labels yet does not refuse `tags`. The empty keys are dropped
 * before anything is sent.
 *
 * A named field that neither shape has is a mistake worth saying out loud —
 * silently sending less than was asked for is how a caller comes to believe a
 * task has no notes.
 */
function detailed(
	full: Record<string, unknown>,
	line: Record<string, unknown>,
	detail: Detail
): Record<string, unknown> {
	if (detail.fields) {
		const known = [...new Set([...Object.keys(full), ...Object.keys(line)])];
		const unknown = detail.fields.filter((name) => !known.includes(name) && name !== 'id');
		if (unknown.length > 0)
			throw new ValidationError(
				`No such field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. This one has ${known.join(', ')}.`
			);
		const out: Record<string, unknown> = { id: full.id };
		for (const name of detail.fields)
			out[name] = Object.hasOwn(full, name) ? full[name] : line[name];
		return present(out);
	}
	return present(detail.verbose ? full : line);
}

/**
 * The release the single-label `tag` and `withoutTag` stop being accepted in.
 *
 * Named rather than "a future release": the caller is a model reading the
 * answer, and it can act on a version number. One constant, so the schema and
 * the sentence the answer carries cannot drift apart.
 */
const SINGLE_TAG_REMOVED_IN = '0.185.0';

/** Each label filter's old spelling, beside the one that replaced it. */
const SINGLE_TAG_ARGS = [
	['tag', 'tags'],
	['withoutTag', 'withoutTags']
] as const;

/**
 * The label filters every listing takes.
 *
 * `tags` narrows to what carries one of a set of words and `withoutTags`
 * drops what carries any of them — "open and not yet `done-by-ai`" is one
 * call rather than a list read and filtered by hand, and a queue spread over
 * `u5`, `e2` and `i5` is one call rather than three. `taggedSince` answers the
 * question a review queue is always asking: what has been marked since I last
 * looked. It reads the date on the join, which is the tag's own and does not
 * move when the thing is edited.
 */
const TAG_ARGS = {
	tags: {
		type: 'array',
		items: { type: 'string' },
		description:
			'Only the ones carrying at least one of these labels, so naming several reads several queues in one call — `["u5", "e2", "i5"]`. Lower case, no #. Several assistants on one list mark their own work this way — `a1`, `done` — so this is how to read back only yours. A single string of them, separated by commas or spaces, is understood too.'
	},
	tagMode: {
		type: 'string',
		enum: [...TAG_MODES],
		description:
			'How `tags` combine. `any` (the default) keeps what carries at least one of them; `all` keeps only what carries every one. `withoutTags` drops the same either way.'
	},
	withoutTags: {
		type: 'array',
		items: { type: 'string' },
		description:
			'Leave out the ones carrying any of these labels. The mirror of `tags`, written the same way; both may be given.'
	},
	tag: {
		type: 'string',
		deprecated: true,
		description: `Deprecated — use \`tags\`, which asks the same thing of any number of labels at once. Still accepted so an assistant written against the old shape keeps working, and removed in ${SINGLE_TAG_REMOVED_IN}.`
	},
	withoutTag: {
		type: 'string',
		deprecated: true,
		description: `Deprecated — use \`withoutTags\`, which drops anything carrying any of the labels named. Still accepted so an assistant written against the old shape keeps working, and removed in ${SINGLE_TAG_REMOVED_IN}.`
	},
	taggedSince: text(
		'Only the ones labelled at or after this moment — `2026-09-21` or a full ISO timestamp. With `tags`, it is the date of whichever of those labels the thing carries; without, any label\u2019s. A label put on before dates were kept does not answer this.'
	)
};

/** A label as the caller wrote it: lower case, no leading hashes, trimmed. */
function tagWord(value: unknown): string {
	return String(value).replace(/^#+/, '').trim().toLowerCase();
}

/**
 * The labels one filter names.
 *
 * A real JSON array and a single string holding all of them both turn up in
 * practice — assistants send `["u5","e2"]` and `"u5, e2"` about equally — and
 * refusing one of them teaches the caller nothing that accepting it does not.
 */
function tagWords(value: unknown): string[] {
	const said = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
	return said.map(tagWord).filter(Boolean);
}

/** The labels one filter names, from the current spelling or the old one. */
function tagsAsked(args: Record<string, unknown>, many: string, one: string): string[] {
	const said = args[many] ?? args[one];
	return said === undefined ? [] : tagWords(said);
}

/**
 * What to say back to a caller that used the single-label spelling.
 *
 * In the answer rather than only in the schema, because a translation nobody
 * is told about is invisible: the call worked, so the assistant goes on using
 * the dead spelling right up to the release that removes it.
 */
function tagWarning(args: Record<string, unknown>): string | null {
	const old = SINGLE_TAG_ARGS.filter(
		([one, many]) => args[one] !== undefined && args[many] === undefined
	);
	if (old.length === 0) return null;

	const were = old.map(([one]) => `\`${one}\``).join(' and ');
	const instead = old.map(([, many]) => `\`${many}\``).join(' and ');
	return (
		`${were} ${old.length > 1 ? 'are' : 'is'} deprecated and will be removed in ${SINGLE_TAG_REMOVED_IN}. ` +
		`Use ${instead}, which ${old.length > 1 ? 'take' : 'takes'} any number of labels — a thing matches if it carries any one of them. ` +
		'This call was translated.'
	);
}

/** A listing's answer, carrying the note when the call used the old spelling. */
function sayingTags(
	answer: Record<string, unknown>,
	args: Record<string, unknown>
): Record<string, unknown> {
	const warning = tagWarning(args);
	return warning ? { ...answer, warning } : answer;
}

/**
 * A moment, from a day or a full timestamp.
 *
 * A bare day means the start of it, which is what somebody asking "since
 * Monday" means. ISO strings compare correctly as strings, so the comparison
 * itself needs no parsing — but the shape is checked here so a typo is a
 * sentence rather than a filter that quietly matches everything.
 */
function momentArg(value: unknown, what: string): string {
	const said = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(said)) return `${said}T00:00:00.000Z`;
	const at = new Date(said);
	if (Number.isNaN(at.getTime()))
		throw new ValidationError(`${what} has to be a date like 2026-03-14 or a full ISO timestamp.`);
	return at.toISOString();
}

/** The label filters a call asked for, in the shape the app's own filter takes. */
function tagFilterOf(args: Record<string, unknown>): TagFilter {
	if (args.tagMode !== undefined && !TAG_MODES.includes(args.tagMode as TagMode))
		throw new ValidationError('tagMode has to be `any` or `all`.');
	return {
		include: tagsAsked(args, 'tags', 'tag'),
		exclude: tagsAsked(args, 'withoutTags', 'withoutTag'),
		mode: args.tagMode === 'all' ? 'all' : 'any'
	};
}

/** Whether a thing's labels satisfy the filters above. */
function passesTags(
	labels: readonly { name: string; taggedAt?: string | null }[],
	args: Record<string, unknown>
): boolean {
	const asked = tagFilterOf(args);
	const wanted = asked.include;
	if (
		!passesTagFilter(
			labels.map((one) => one.name),
			asked
		)
	)
		return false;

	if (args.taggedSince !== undefined) {
		const since = momentArg(args.taggedSince, 'taggedSince');
		const counted =
			wanted.length === 0 ? labels : labels.filter((one) => wanted.includes(one.name));
		if (!counted.some((one) => one.taggedAt && one.taggedAt >= since)) return false;
	}
	return true;
}

/** How long an opening is: enough to tell two things apart. */
const PREVIEW_CHARS = 140;

/** The start of a piece of writing on one line, or nothing when it is empty. */
function openingOf(text: string): string | undefined {
	const opening = text.trim().replace(/\s+/g, ' ');
	if (!opening) return undefined;
	return opening.length > PREVIEW_CHARS ? `${opening.slice(0, PREVIEW_CHARS)}\u2026` : opening;
}

/** The pictures and recordings a piece of writing refers to, as links. */
const MEDIA_LINK = /\/media\/(?:audio\/)?\d+/g;

/**
 * A todo as little as it can be said in.
 *
 * The service's shape is written for the app, which wants every column laid
 * out whether or not it holds anything. Sent to a model, forty of those are
 * mostly the words `null`, `categoryColor` and an empty ratings object —
 * paid for three times over on the way in, the way out and again next turn.
 * Anything absent is left out; a reader learns the same thing from a missing
 * key as from a null one.
 */
function briefly(todo: Todo): Record<string, unknown> {
	const out: Record<string, unknown> = { id: todo.id, title: todo.title, status: todo.status };
	// The number a person can see on the screen and say out loud — the fourth
	// task about the kitchen is #4. The id is ours; this one is theirs.
	out.seq = todo.notebookSeq ?? undefined;
	out.notes = todo.notes || undefined;
	out.scheduledDate = todo.scheduledDate || undefined;
	out.category = todo.categoryName || undefined;
	out.notebookId = todo.notebookId ?? undefined;
	out.notebook = todo.notebookTitle || undefined;
	out.archivedAt = todo.archivedAt || undefined;
	// Names, not ids: the id of a tag is of no use to a reader, and the whole
	// point of a label here is the word.
	out.tags = todo.tags.length > 0 ? todo.tags.map((one) => one.name) : undefined;
	/*
	 * And when each went on, where that is known.
	 *
	 * Separate from `tags` so the common reading stays a plain list of words.
	 * This is what lets a caller answer "what has been marked since this
	 * morning" without comparing against a list it remembered — the task's own
	 * `updatedAt` moves for every edit and cannot say.
	 */
	const dated = todo.tags.filter((one) => one.taggedAt);
	out.taggedAt =
		dated.length > 0 ? Object.fromEntries(dated.map((one) => [one.name, one.taggedAt])) : undefined;
	const ratings = Object.fromEntries(
		Object.entries(todo.ratings).filter(([, value]) => value !== null)
	);
	out.ratings = Object.keys(ratings).length > 0 ? ratings : undefined;
	return out;
}

/**
 * The same task as one line: which one it is, and where it stands.
 *
 * What a list is read for. The notes are the expensive part of a task and the
 * part a list is least likely to want — a caller looking for one asks by id
 * once it has found it, or says `verbose`.
 */
function asLine(todo: Todo): Record<string, unknown> {
	const out: Record<string, unknown> = { id: todo.id, title: todo.title, status: todo.status };
	out.seq = todo.notebookSeq ?? undefined;
	out.tags = todo.tags.length > 0 ? todo.tags.map((one) => one.name) : undefined;

	/*
	 * An opening, and what it refers to — the same two a note's line carries.
	 *
	 * A title is not always the task. Half the tasks on a working list are a
	 * line of title and a paragraph of what actually happened, with the
	 * screenshot that prompted it, and a line that mentioned neither made the
	 * list unreadable without a second call per row. The opening says what
	 * this is about and the links say what to fetch if it matters; `verbose`
	 * is still there for the whole of it.
	 */
	out.opening = openingOf(todo.notes ?? '');
	const links = [...new Set((todo.notes ?? '').match(MEDIA_LINK) ?? [])];
	out.media = links.length > 0 ? links : undefined;
	return out;
}

/** A task, at whatever detail was asked for. */
const shapeTodo = (detail: Detail) => (todo: Todo) => detailed(briefly(todo), asLine(todo), detail);

/**
 * A note, as a line and as the whole thing.
 *
 * The words are the point of a note and also the expensive part of one: a
 * notebook of forty notes is a book, and a listing read to find one should not
 * carry all of them. The line keeps what identifies it — its number, its name,
 * its labels, when it was written — and an opening so a reader can tell two
 * apart. `verbose` gives the writing.
 */
type NoteRow = {
	id: number;
	seq?: number | null;
	title?: string;
	content: string;
	createdAt: string;
	updatedAt?: string | null;
	archivedAt?: string | null;
	pinnedAt?: string | null;
	tags: { id?: number; name: string; taggedAt?: string | null }[];
};

function noteLine(note: NoteRow): Record<string, unknown> {
	const out: Record<string, unknown> = { id: note.id, createdAt: note.createdAt };
	out.seq = note.seq ?? undefined;
	out.title = note.title || undefined;
	out.opening = openingOf(note.content);
	out.tags = note.tags.length > 0 ? note.tags.map((one) => one.name) : undefined;
	out.pinned = note.pinnedAt ? true : undefined;
	out.archivedAt = note.archivedAt || undefined;

	/*
	 * What it refers to, as links rather than as bytes.
	 *
	 * A note's pictures are the most expensive thing about it and usually not
	 * why it is being read. The line says they are there and what to ask for;
	 * `media` fetches one when it turns out to matter. An opening that stops
	 * before the pictures would otherwise hide them entirely.
	 */
	const links = [...new Set(note.content.match(MEDIA_LINK) ?? [])];
	out.media = links.length > 0 ? links : undefined;
	return out;
}

function noteFull(note: NoteRow): Record<string, unknown> {
	const out: Record<string, unknown> = { ...noteLine(note), content: note.content };
	delete out.opening;
	out.updatedAt = note.updatedAt || undefined;
	const dated = note.tags.filter((one) => one.taggedAt);
	out.taggedAt =
		dated.length > 0 ? Object.fromEntries(dated.map((one) => [one.name, one.taggedAt])) : undefined;
	return out;
}

const shapeNote = (detail: Detail) => (note: NoteRow) =>
	detailed(noteFull(note), noteLine(note), detail);

/**
 * The four states a task can be in, plus the two words people actually use.
 *
 * `open` is "not finished and not given up on", which is the question behind
 * almost every listing; `closed` is its complement. Naming the four as well
 * means a caller that wants exactly `doing` can say so.
 */
const TASK_STATES = ['todo', 'doing', 'done', 'skipped', 'open', 'closed'] as const;

function matchesState(todo: Todo, said: unknown): boolean {
	const closed = CLOSED_STATUSES.includes(todo.status);
	if (said === 'open') return !closed;
	if (said === 'closed') return closed;
	return todo.status === said;
}

/**
 * A list of what something is measured by: names and units, no amounts.
 *
 * The workout's own declaration, shared by the tool that makes one and the
 * tool that changes what it measures, so the two cannot describe it
 * differently.
 */
const MEASURE_NAMES = {
	type: 'array',
	description:
		'What this workout is measured by, in the order a session should be asked for them. Names and units in the person\u2019s own words; no amounts.',
	items: {
		type: 'object',
		properties: {
			activity: {
				type: 'string',
				description: 'What is measured: \u201cran\u201d, \u201cbenched\u201d.'
			},
			unit: {
				type: 'string',
				description: 'Of what: \u201ckm\u201d, \u201ckg\u201d, \u201creps\u201d.'
			}
		},
		required: ['activity']
	}
} as const;

/** A 0–5 rating, or nothing. Bad numbers are refused before a service sees them. */
const rating = (value: unknown, what: string): number | undefined => {
	if (value === undefined || value === null) return undefined;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1 || n > 5)
		throw new ValidationError(`${what} is a whole number from 1 to 5.`);
	return n;
};

/**
 * The release `energy` stops being accepted in.
 *
 * Named rather than "a future release": the caller is a model reading this
 * answer, and it can act on a version number. One constant, so the sentence
 * and the schema cannot drift apart.
 */
const ENERGY_REMOVED_IN = '0.190';

const ratingArgs = {
	urgency: { type: 'integer', description: 'How soon it has to happen, 0–5.' },
	interest: { type: 'integer', description: 'How much they want to do it, 0–5.' },
	ease: {
		type: 'integer',
		description:
			'How easy it is, 0–5, five being easiest. Replaces `energy`, which asked the opposite question on a scale that began at one.'
	},
	energy: {
		type: 'integer',
		deprecated: true,
		description: `Deprecated — use \`ease\`, which is this turned round: an energy of 5 is an ease of 1. Still accepted so an assistant written against the old shape keeps working, and removed in ${ENERGY_REMOVED_IN}.`
	}
};

/**
 * The scale `energy` was asked on: one to five, and frozen at that.
 *
 * Written out rather than taken from `RATING_MIN` and `RATING_MAX`, which have
 * since moved — the scale starts at nought now. A caller still saying `energy`
 * is speaking the old scale, and the number that mirrors it has to be the old
 * one for ever: reading today's bounds would quietly turn an energy of 5 into
 * an ease of 0 instead of 1.
 */
const ENERGY_ENDS = { min: 1, max: 5 } as const;

/**
 * What `energy` means now that the question is `ease`.
 *
 * Mirrored rather than refused: a caller that has not been updated is asking a
 * coherent question on the old scale, and answering it wrongly is worse than
 * either accepting or refusing it. The same arithmetic the migration used on
 * the values already stored.
 */
const easeFromEnergy = (value: number) => ENERGY_ENDS.min + ENERGY_ENDS.max - value;

/** Whether this call reached for the old spelling, which is worth saying back. */
const usedEnergy = (args: Record<string, unknown>) =>
	args.energy !== undefined && args.ease === undefined;

/**
 * What to say back to a caller that used it.
 *
 * In the answer rather than only in the schema, because a translation nobody
 * is told about is invisible: the call worked, and the assistant goes on using
 * the dead spelling until the release that removes it.
 */
const ENERGY_WARNING =
	`\`energy\` is deprecated and will be removed in ${ENERGY_REMOVED_IN}. ` +
	'Use `ease`, which asks the opposite question on the same scale — an ' +
	'energy of 5 is an ease of 1. This call was translated.';

/** Ease, from whichever of the two arguments the caller used. */
function easeOf(args: Record<string, unknown>): number | null {
	const asked = rating(args.ease, 'ease');
	if (asked !== undefined) return asked ?? null;
	const old = rating(args.energy, 'energy');
	return old === undefined || old === null ? null : easeFromEnergy(old);
}

const ratingsOf = (args: Record<string, unknown>) => ({
	urgency: rating(args.urgency, 'urgency') ?? null,
	interest: rating(args.interest, 'interest') ?? null,
	ease: easeOf(args)
});

const gaveARating = (args: Record<string, unknown>) =>
	args.urgency !== undefined ||
	args.interest !== undefined ||
	args.ease !== undefined ||
	args.energy !== undefined;

/*
 * WHAT NEVER GETS A DELETE TOOL
 *
 * Deletion verbs here exist only for cheap, often-reversed things: blocks and
 * repeating blocks, reminders, ideas, todos, shopping items. Data that
 * accumulates a story or stands for people and commitments — a person's page,
 * a habit and its kept days, a goal, a goal area — is never deletable through
 * a tool, however symmetric that would look beside its add_*. A
 * mis-transcription is fixed with the change_* verb; a real deletion is rare,
 * and the person does it themselves in the app.
 */

/**
 * The category the caller named, refused loudly when it names nothing.
 *
 * This used to fall back to the first category on a miss, so a typo filed
 * work under the wrong part of life and reported success. A blind write is
 * worse than a refusal.
 *
 * The refusal names the tool to call rather than listing the categories: a
 * token may hold `schedule:write` and not `schedule:read`, and an error
 * message is not the place to hand over the names that the read grant is
 * what gates. The tool it points at is gated properly.
 */
function categoryByName(ctx: Ctx, wanted: unknown): { id: number; name: string } {
	const all = listCategories(ctx) as { id: number; name: string }[];
	if (all.length === 0)
		throw new ValidationError(
			'This account has no categories yet, and a block belongs to one. Make one in the app first.'
		);

	const said = typeof wanted === 'string' ? wanted.trim().toLowerCase() : '';
	if (!said) return all[0];

	const hit =
		all.find((c) => c.name.toLowerCase() === said) ??
		all.find((c) => c.name.toLowerCase().includes(said));
	if (!hit)
		throw new ValidationError(
			`No category called "${String(wanted)}". Call \`categories\` for the names.`
		);
	return hit;
}

/**
 * A habit by name, for a token that may write habits and not read them.
 *
 * `habits:write` on its own was a permission that could not be used: the tick
 * takes an id, and the only thing that hands out ids is `habits`, which is
 * behind `habits:read`. Rather than have one grant quietly imply the other —
 * a tick is not a licence to read a month of somebody's slips — the write
 * tool can find the habit itself.
 *
 * Names are not unique, so an ambiguous one is refused rather than guessed:
 * ticking the wrong habit is a lie in somebody's history.
 */
function habitByName(ctx: Ctx, wanted: unknown): { id: number; name: string } {
	const said = typeof wanted === 'string' ? wanted.trim().toLowerCase() : '';
	if (!said) throw new ValidationError('Which habit? Give its name or its id.');

	const all = listHabits(ctx) as { id: number; name: string }[];
	const exact = all.filter((h) => h.name.toLowerCase() === said);
	const near = exact.length > 0 ? exact : all.filter((h) => h.name.toLowerCase().includes(said));

	if (near.length === 0)
		throw new ValidationError(
			`No habit called "${String(wanted)}"${
				all.length > 0 ? '. Call `habits` for the names.' : '.'
			}`
		);
	if (near.length > 1)
		throw new ValidationError(
			`More than one habit matches "${String(wanted)}": ${near.map((h) => h.name).join(', ')}. Use the exact name.`
		);
	return near[0];
}

// --- The before and the after -------------------------------------------------

/**
 * Finders for the mutation answers.
 *
 * Every writing tool's result carries `before` and `after` — the subject as it
 * was and as it is — so a wrong call is reversible from the transcript. Nearly
 * every one of those subjects is just the thing the call names, which `refs`
 * already resolves, so the protocol layer reads it from there and there is
 * nothing to declare. What is left here are the few subjects that are more
 * than one row: a bill with its payments, a habit's tick on a given day.
 */

/**
 * The measures a caller wrote out, in the shape the service takes.
 *
 * `targetValue` and `unit` came first and still work — they are the goal that
 * counts one thing — so a caller that knows nothing about measures keeps
 * working, and one with several passes `targets`.
 */
function targetsFrom(args: Record<string, unknown>, existing?: GoalTarget) {
	if (Array.isArray(args.targets))
		return args.targets.map((raw) => {
			const t = (raw ?? {}) as {
				id?: unknown;
				value?: unknown;
				unit?: unknown;
				measure?: unknown;
			};
			return { id: t.id, value: t.value, unit: t.unit, measureActivity: t.measure };
		});
	if (args.targetValue !== undefined && args.targetValue !== null)
		return [
			{
				// The measure it already had, so raising a target from ten to twelve
				// keeps both its unit and the progress against it.
				id: existing?.id,
				value: args.targetValue,
				unit: args.unit ?? existing?.unit,
				measureActivity: args.measure ?? existing?.measureActivity ?? undefined
			}
		];
	return undefined;
}

/**
 * Which of a goal's measures a call is about.
 *
 * Named by its unit, because that is what the person said — "I read two more
 * books" — and the ids are ours rather than theirs. A goal with one measure
 * needs no naming; one with several is asked rather than guessed at, since
 * guessing writes the right number onto the wrong thing.
 */
function pickTarget(goal: { targets: GoalTarget[] }, unit: unknown): GoalTarget {
	if (goal.targets.length === 0)
		throw new ValidationError(
			'That goal counts nothing yet. `add_goal_target` gives it something to count.'
		);

	const said = unit === undefined || unit === null ? '' : String(unit).trim().toLowerCase();
	if (said === '') {
		if (goal.targets.length === 1) return goal.targets[0];
		throw new ValidationError(
			`That goal is measured by several things (${goal.targets.map((t) => t.unit || 'unnamed').join(', ')}). Say which with \`unit\`.`
		);
	}

	const hit = goal.targets.find((t) => t.unit.toLowerCase() === said);
	if (!hit)
		throw new ValidationError(
			`That goal has no measure in ${String(unit)}. It counts: ${goal.targets.map((t) => t.unit || 'unnamed').join(', ')}.`
		);
	return hit;
}

/** The parameter both goal tools take for "what it is measured by". */
const targetsParam = {
	type: 'array',
	items: {
		type: 'object',
		properties: {
			value: { type: 'number', description: 'How much of it.' },
			unit: { type: 'string', description: 'What is being counted — gigs, songs, km.' },
			measure: {
				type: 'string',
				description:
					'A workout measure this counts, in the word the sessions use \u2014 "ran", "deadlifted". Set it and the number is the sum of what the register holds for that activity inside the goal\u2019s period, read rather than typed; `workout_sessions` and `workouts` show what has been measured. Leave it off for a number the person keeps themselves.'
			}
		},
		required: ['value']
	},
	description:
		'Everything the goal is measured by, replacing what it has: `[{ "value": 3, "unit": "gigs" }, { "value": 5, "unit": "songs" }]`. A goal met by doing one thing can say `targetValue` and `unit` instead.'
} as const;
/** A bill is not only its row: what was paid against it is half the answer. */
const billWithPayments = (ctx: Ctx, args: Record<string, unknown>) => {
	const id = Number(args.id);
	return { bill: getBill(ctx, id), payments: listPayments(ctx, id) };
};
/** The tick itself: null before an occurrence exists is what "unticked" is. */
const habitTick = (ctx: Ctx, args: Record<string, unknown>) => {
	const habitId = args.id ? Number(args.id) : habitByName(ctx, args.name).id;
	const date =
		typeof args.date === 'string' && args.date ? args.date : localDateOf(ctx.now, ctx.tz);
	return {
		habitId,
		date,
		ticked: listOccurrences(ctx).some((o) => o.habitId === habitId && o.date === date)
	};
};
const winsOfDay = (ctx: Ctx, args: Record<string, unknown>) => {
	const date = args.date ? day(args.date, 'date') : localDateOf(ctx.now, ctx.tz);
	return { date, wins: listWins(ctx, date) };
};
const weekNote = (ctx: Ctx, args: Record<string, unknown>) => {
	const weekStart = weekStartOf(ctx, args.weekStart);
	return { weekStart, note: readNote(ctx, weekStart) };
};

/**
 * How often a repeating block comes back, for the tools that set it.
 *
 * The app has offered every-N-weeks, every-N-days and monthly since blocks
 * could repeat at all; this surface could only ever make a weekly one, which
 * left "put the bins out every other Tuesday" impossible to ask for.
 */
const repeatArgs = {
	repeats: {
		type: 'string',
		enum: ['weekly', 'every_n_weeks', 'every_n_days', 'monthly'],
		description:
			'How often it comes back. Weekly if left out. `every_n_weeks` and `every_n_days` need `every`; `monthly` needs `month_day` and ignores the weekday.'
	},
	every: {
		type: 'integer',
		description: 'The N in every N weeks or every N days — 2 is "every other".'
	},
	month_day: {
		type: 'integer',
		description:
			'For `monthly`: which day of the month, 1 to 31. A month too short for it uses its last day.'
	}
} as const;

/**
 * The rule these arguments describe, or `undefined` when they say nothing —
 * which is how a change that does not mention the rhythm leaves it alone.
 *
 * `anchor` is the day the rhythm starts, and every shape gets one: it is what
 * every-N counts from — "every other Tuesday" starting on the Tuesday somebody
 * meant — and it is also what stops a plain weekly block being a claim about
 * every Saturday there has ever been, filling a past it was never part of.
 */
function recurrenceFromArgs(args: Record<string, unknown>, anchor: string): string | undefined {
	const repeats = args.repeats;
	if (repeats === undefined || repeats === null || repeats === '') return undefined;

	const every = Math.trunc(Number(args.every ?? 1));
	if (repeats === 'every_n_weeks' || repeats === 'every_n_days') {
		if (!Number.isInteger(every) || every < 1 || every > MAX_INTERVAL) {
			throw new ValidationError(`\`every\` must be a whole number from 1 to ${MAX_INTERVAL}`);
		}
		const kind = repeats === 'every_n_weeks' ? 'weeks' : 'days';
		return serialiseRecurrence({ kind, interval: every, anchor });
	}
	if (repeats === 'monthly') {
		const day = Math.trunc(Number(args.month_day ?? 1));
		if (!Number.isInteger(day) || day < 1 || day > 31) {
			throw new ValidationError('`month_day` must be a whole number from 1 to 31');
		}
		return serialiseRecurrence({ kind: 'monthly', day, anchor });
	}
	return serialiseRecurrence({ kind: 'weekly', anchor });
}

/**
 * The tools speak English — their descriptions, their errors, their answers —
 * whatever language the account reads the app in, so a rhythm described here
 * is described from the English catalogue.
 */
const english = translator('en', englishMessages);

/** The rhythm in words, so a row does not have to be decoded to be read. */
function repeatsInWords(recurrence: string | null, weekday: number): string {
	return describeRecurrence(parseRecurrence(recurrence), weekday, english);
}

/** The next date on or after `from` that falls on this Monday-indexed weekday. */
function nextWeekdayOnOrAfter(from: Date, weekday: unknown): Date {
	const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
	const ahead = (Math.trunc(Number(weekday)) - ((d.getDay() + 6) % 7) + 7) % 7;
	d.setDate(d.getDate() + ahead);
	return d;
}

export const TOOLS: Tool[] = [
	// ── Looking ──────────────────────────────────────────────────────────────
	{
		name: 'today',
		title: "Today's plan",
		description:
			"What is on today: the blocks planned for it and the tasks pulled onto it. This is the answer to 'what am I meant to be doing', and the first thing to reach for before adding anything. Habits are not here — they are their own permission, and their own tool.",
		scope: 'today:read',
		writes: false,
		input: object({}),
		run: (ctx) => getTodayBoard(ctx)
	},
	{
		name: 'habits',
		title: 'Habits due today',
		description:
			"The habits scheduled for today, each with its streak and whether it has been kept yet. Separate from the day's plan on purpose: whether somebody kept their habits is a more personal thing than what is on their calendar, so it is granted separately.",
		scope: 'habits:read',
		writes: false,
		input: object({}),
		run: (ctx) => getTodayBoard(ctx, { habits: true }).habits ?? []
	},
	{
		/*
		 * Reading whether somebody kept their habits, and being unable to say
		 * that they did, is a strange half of a feature: "I did my stretching"
		 * is the most ordinary sentence there is about a habit.
		 */
		name: 'tick_habit',
		title: 'Tick a habit',
		description:
			'Tick a habit for a day: for something being built, the tick means it was done; for something being avoided, it means it happened. Name it or give the id `habits` gave; a name that matches two habits is refused rather than guessed. Ticking twice is not an error; the second call takes it back, which is how the app\u2019s own tick behaves.',
		scope: 'habits:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'habit' }],
		input: object({
			id: { type: 'integer', description: 'The habit\u2019s id, as `habits` gave it.' },
			name: text('The habit by name, when the id is not to hand — "stretching".'),
			date: text('The day, as YYYY-MM-DD. Today if left out.')
		}),
		subject: habitTick,
		run: (ctx, args) => {
			const habit = args.id ? { id: args.id, name: '' } : habitByName(ctx, args.name);
			toggleOccurrence(ctx, {
				habitId: habit.id,
				date: args.date ?? localDateOf(ctx.now, ctx.tz)
			});
			return { ok: true, habit: habit.name || undefined };
		}
	},
	{
		/*
		 * Answering for a block, which is the other half of reading the day.
		 *
		 * The ids are the ones `today` hands back. Both answers are kept: "done"
		 * and "skipped" are different facts about a week, and a tracker that only
		 * accepts the good one starts lying by the second week.
		 */
		name: 'finish_block',
		title: 'Mark a block done or skipped',
		description:
			'Answer for one block on the day: it happened, or it did not. Takes the id `today` gives for that block. Skipping is a real answer — say skipped when the person says they did not do it. It is NOT a way to clear something off the day: a skip goes into the week\u2019s record and the review asks about it. To move a block use `change_block`; to take one off because it was never happening use `cancel_block`. `todo` takes an answer back, for one ticked by mistake.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'block' }],
		input: object(
			{
				id: text('The block’s id, exactly as `today` gave it — it looks like `slot:42`.'),
				status: {
					type: 'string',
					enum: ['done', 'skipped', 'todo'],
					description: 'What actually happened.'
				}
			},
			['id', 'status']
		),
		run: (ctx, args) => {
			setOccurrenceStatus(ctx, args.id, args.status);
			return { ok: true };
		}
	},
	{
		/*
		 * A block on one day, which is not a todo.
		 *
		 * A todo is a thing to do with no hour attached; this is an hour. Asked
		 * for "deep work 9 to 11 today", an assistant with only `add_todo` writes
		 * the time into the title and the day still looks empty, which is the
		 * failure this exists to stop.
		 */
		name: 'add_block',
		title: 'Put a block on a day',
		description:
			'Add a one-off block to one day: a title, a start time and how long it runs. This is for "deep work from 9 to 11 today" — a thing with an hour. Use `add_todo` instead when there is no time attached, and `change_block` to move or rename something already on the day rather than adding a second copy of it. It does not touch the repeating week; this is that day only.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				date: text('The day, as YYYY-MM-DD.'),
				title: text('What it is — shown on the block.'),
				start_time: text('When it starts, as HH:MM on a 24-hour clock.'),
				minutes: count('How long it runs, in minutes.', 60),
				category: text(
					'Which part of life it belongs to, by name — `categories` lists them. A name that matches nothing is refused, never guessed. The first category is used only when this is left out entirely.'
				),
				...ratingArgs
			},
			['date', 'title', 'start_time']
		),
		run: (ctx, args) => {
			// A block belongs to a category — the colour it is drawn in and the
			// bucket the week is counted into — resolved by name and refused on a
			// miss, because a typo silently filed under the wrong life was worse
			// than an error.
			const chosen = categoryByName(ctx, args.category);

			const id = createExceptional(ctx, {
				date: day(args.date, 'date'),
				mode: 'category',
				categoryId: chosen.id,
				label: args.title,
				startTime: args.start_time,
				durationMinutes: args.minutes ?? 60,
				...(gaveARating(args) ? { ratings: ratingsOf(args) } : {})
			});

			return usedEnergy(args)
				? { id, category: chosen.name, warning: ENERGY_WARNING }
				: { id, category: chosen.name };
		}
	},
	{
		/*
		 * The verb that was missing, and what its absence cost.
		 *
		 * Asked to "push the study block to four", an assistant with only add and
		 * answer-for invented a move: it added a second block at 16:00 and marked
		 * the original *skipped* to clear the first one off the grid. The day then
		 * recorded something that had not happened — and a skip is not cosmetic,
		 * it is what the weekly review asks about.
		 *
		 * A tool surface that cannot express an ordinary request does not produce
		 * a refusal; it produces a workaround, and the workaround writes to
		 * somebody's record of their own life.
		 */
		name: 'change_block',
		title: 'Move or rename a block',
		description:
			'Change one block on one day: its time, its day, how long it runs, or what it is called. This is "push the study block to four", "make it two hours", "that was actually client work". Takes the id `today` or `upcoming` gives. Only the fields you pass change. It affects that day only — moving this Thursday\u2019s gym does not move gym — and it never edits the repeating week. Renaming keeps which part of life it belongs to and stops it being the named activity it was, because that is what saying it was something else means.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'block' }],
		input: object(
			{
				id: text('The block\u2019s id, exactly as the day gave it — like `slot:42`.'),
				date: text('Move it to this day, as YYYY-MM-DD. Leave out to keep the day it is on.'),
				start_time: text('The new start, as HH:MM on a 24-hour clock.'),
				minutes: { type: 'integer', description: 'How long it should run, in minutes.' },
				title: text('What it should be called instead.'),
				category: text(
					'Refile it under this part of life, by name — `categories` lists them. Affects that day only, like everything here.'
				)
			},
			['id']
		),
		run: (ctx, args) =>
			changeOccurrence(ctx, args.id, {
				date: args.date,
				startTime: args.start_time,
				minutes: args.minutes,
				title: args.title,
				...(args.category !== undefined && args.category !== null && args.category !== ''
					? { categoryId: categoryByName(ctx, args.category).id }
					: {})
			})
	},
	{
		name: 'cancel_block',
		title: 'Take a block off the day',
		description:
			'Remove a block from a day because it is not happening — the meeting moved, the class was called off, it was put on the wrong day. This is NOT the same as marking it skipped: skipped means it was meant to happen and did not, which is a fact the weekly review asks about, and cancelled means it was never going to. Use `finish_block` with "skipped" for the first and this for the second. A repeating block is only removed from that one day.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'block' }],
		/*
		 * Cancelling removes the row — `cancelOccurrence` deletes the one-off
		 * or the instance — so it is a delete however gently it is described,
		 * and it asks for the grant every other delete asks for.
		 */
		destroys: true,
		input: object(
			{ id: text('The block\u2019s id, exactly as the day gave it — like `slot:42`.') },
			['id']
		),
		run: (ctx, args) => cancelOccurrence(ctx, args.id)
	},
	{
		name: 'upcoming',
		title: 'The days ahead',
		description:
			'Everything planned from today onwards — the blocks of the week, in order. Use it to answer questions about a day that is not today.',
		scope: 'schedule:read',
		writes: false,
		input: object({ days: count('How many days from today, up to 31.', 7) }),
		run: (ctx, args) => getUpcomingSchedule(ctx, { days: args.days ?? 7 })
	},
	{
		/*
		 * The week that has already happened, which nothing could reach.
		 *
		 * Answering for a block always worked on any block, past or future —
		 * but the only lists were `today` and `upcoming`, so a block from last
		 * Tuesday had no id anybody could name. "I did not actually do Monday's
		 * run, and I did do the reading" was unanswerable for want of a
		 * listing, and a week's record that can only be corrected on the day is
		 * a week's record that quietly drifts from the truth.
		 */
		name: 'past',
		title: 'The days behind',
		description:
			'What was on the days that have already happened, with what each one was answered — done, skipped, or nothing yet. Use it before correcting a week: it gives the ids `finish_block` needs. Ask for a week back with `days: 7`, or name the day it starts on.',
		scope: 'schedule:read',
		writes: false,
		input: object({
			days: count('How many days to look back over, up to 31.', 7),
			startingOn: text(
				'The first day to include, as YYYY-MM-DD. Left out, it is that many days before today.'
			)
		}),
		run: (ctx, args) => {
			const days = Number(args.days ?? 7);
			// Counted back from today unless a day is named, so `days: 7` means
			// "the last week" rather than "the week starting a week ago and
			// ending now" — which is the same range, said the way people say it.
			const startingOn =
				args.startingOn ?? localDateOf(new Date(ctx.now.getTime() - days * 86400_000), ctx.tz);

			return getUpcomingSchedule(ctx, { days, startingOn, includeCompleted: true });
		}
	},
	{
		name: 'search',
		title: 'Search everything written',
		description:
			'One search over diary entries, notebooks, notes, ideas, goals, people, recipes and todos. Prefer this to guessing which room a thing is in.',
		scope: 'search:read',
		writes: false,
		input: object({ query: text('What to look for.') }, ['query']),
		run: (ctx, args) =>
			grouped(search(ctx, args.query)).map((g) => ({
				kind: g.kind,
				label: g.label,
				hits: g.hits
			}))
	},

	/*
	 * A picture or a recording, to whoever may read the thing it is in.
	 *
	 * 0.181.0 made a file reachable over HTTP with a bearer key — and an
	 * assistant connected over MCP never holds one: its client keeps the
	 * credential and hands out none, so the capability worked for a script
	 * with a pasted key and not for the client it was built for. A screenshot
	 * dropped into a todo was a thing the model could see the link to and not
	 * the picture.
	 *
	 * The permission is unchanged, and is the same function the HTTP route
	 * asks (`mayReadFile`): a file answers to whatever refers to it — one in a
	 * note wants `notes:read`, a face `people:read`, one on a task
	 * `tasks:read` — and a file nothing refers to is reachable by nobody. So
	 * this is a second door onto the rule, not a second rule, and no new
	 * grant.
	 */
	{
		name: 'media',
		title: 'A picture or a recording',
		description:
			'The bytes of a file this key may see, given the link as it appears in the writing \u2014 `/media/12` for a picture, `/media/audio/12` for a recording. A file answers to whatever refers to it, so the grant that lets you read the note lets you see the picture in it; one nothing refers to is reachable by nobody.',
		scope: 'notes:read',
		anyScope: ['notes:read', 'ideas:read', 'tasks:read', 'people:read', 'kitchen:read'],
		writes: false,
		// It takes a link rather than an id, so it declares no reach — and it
		// applies the confinement itself, below, through `mayReadFile`.
		confinesItself: true,
		input: object(
			{
				path: text(
					'The link, exactly as the text writes it: `/media/12`, or `/media/audio/12` for a recording. The number alone is taken as a picture.'
				)
			},
			['path']
		),
		run: (ctx, args, caller) => {
			/*
			 * The link rather than a number and a kind.
			 *
			 * What a model is looking at is `![shot](/media/48)` in a note, and
			 * handing that back is one step with nothing to get wrong. Two
			 * arguments would also make "which id is a recording" a question
			 * the caller has to answer about a number it has never seen.
			 */
			const said = String(args.path ?? '').trim();
			const match = /^(?:\/?media\/)?(audio\/)?(\d+)$/.exec(said.replace(/^\//, ''));
			if (!match) throw new ValidationError('path is a link like /media/12 or /media/audio/12.');

			const recording = Boolean(match[1]);
			const id = Number(match[2]);

			const referrers = recording ? recordingReferrers(ctx, id) : pictureReferrers(ctx, id);
			/*
			 * The same answer for a file that is not there and one this key may
			 * not see: these are small integers, and telling the two apart is
			 * arithmetic anybody could do.
			 */
			if (!caller || !mayReadFile(referrers, caller.scopes, caller.confinement ?? null))
				throw new NotFoundError('No such file, or nothing you may read refers to it.');

			const file = recording ? readRecording(ctx, id) : readPicture(ctx, id);
			return {
				media: {
					mime: file.mime,
					base64: Buffer.from(file.bytes).toString('base64')
				}
			};
		}
	},

	// ── The todo list ────────────────────────────────────────────────────────
	{
		name: 'todos',
		title: 'The todo list',
		description:
			'Tasks with no date on them yet. A todo gains a date by being put on a day, which promotes it onto the week. Answers with a line per task; `verbose` or `fields` for more. Narrow it rather than reading it whole \u2014 `notebookId` for one subject, `status: "open"`, `tags`, `withoutTags`, `taggedSince`.',
		scope: 'tasks:read',
		writes: false,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object({
			limit: count('How many to return.', 50),
			offset: from('the list'),
			notebookId: {
				type: 'integer',
				description:
					'Only the tasks filed under this notebook, as `notebooks` gives its id. `0` is the ones filed under nothing.'
			},
			includeArchived: {
				type: 'boolean',
				description:
					'Include the tasks that have been put away. Off by default, which is what putting away means.'
			},
			status: {
				type: 'string',
				enum: [...TASK_STATES],
				description:
					'Only the tasks in this state. `open` is everything not finished and not skipped, which is what a list is usually read for.'
			},
			...TAG_ARGS,
			...DETAIL_ARGS
		}),
		run: (ctx, args) => {
			const detail = detailOf(args);
			let rows = listTodos(ctx, { tags: tagFilterOf(args) });
			if (!args.includeArchived) rows = rows.filter((todo) => !todo.archivedAt);
			if (args.notebookId !== undefined) {
				const wanted = Number(args.notebookId);
				rows = rows.filter((todo) =>
					wanted === 0 ? todo.notebookId === null : todo.notebookId === wanted
				);
			}
			if (args.status !== undefined) rows = rows.filter((todo) => matchesState(todo, args.status));
			rows = rows.filter((todo) => passesTags(todo.tags, args));
			return sayingTags(paged(rows.map(shapeTodo(detail)), args, 50), args);
		}
	},
	/*
	 * What to do next, by the numbers the person put on their own tasks.
	 *
	 * Urgency first, then ease, then interest: a tie between two urgent things
	 * goes to the easier one.
	 *
	 * An unrated task is not a zero — it is the middle of the scale, and that
	 * rule lives in `$lib/ratings`, so the board and this answer the same
	 * question the same way.
	 *
	 * It exists so that "what should I be doing" is one small call rather than
	 * the whole list read and sorted by a model that then has to explain
	 * itself.
	 */
	{
		name: 'up_next',
		title: 'What to do next',
		description:
			'The task to do next, by the ratings on it: most urgent first, then the easiest, then the one most wanted. All three run the same way \u2014 five is the most of what the word says. An unrated one is not a zero: it counts as the middle of the scale, 2.5, so anything marked 4 or 5 beats it and 1 or 2 falls below it as the postpone tiers. Open, unarchived, undated tasks only \u2014 anything with a day on it is on the week and `today` answers for that. Answers with one line by default; `limit` for a short list to choose between, and `tags` to ask it of one queue or of several at once.',
		scope: 'tasks:read',
		writes: false,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object({
			limit: count('How many to return. One is the usual question.', 1),
			notebookId: {
				type: 'integer',
				description: 'Only tasks filed under this notebook, as `notebooks` gives its id.'
			},
			...TAG_ARGS,
			...DETAIL_ARGS
		}),
		run: (ctx, args) => {
			const detail = detailOf(args);
			let rows = listTodos(ctx, { tags: tagFilterOf(args) }).filter(
				(todo) => !todo.archivedAt && !CLOSED_STATUSES.includes(todo.status)
			);
			if (args.notebookId !== undefined)
				rows = rows.filter((todo) => todo.notebookId === Number(args.notebookId));
			rows = rows.filter((todo) => passesTags(todo.tags, args));

			const ordered = [...rows].sort(compareByPriority);

			return sayingTags(
				pageOf(ordered.slice(0, limitOf(args, 1, 20)).map(shapeTodo(detail)), rows.length, 0),
				args
			);
		}
	},
	{
		name: 'add_todo',
		title: 'Add a todo',
		creates: 'todo' as const,
		description:
			'Put a task on the todo list. Leave the date off unless the person said when — a todo with no date is the normal case here, not an unfinished one.',
		scope: 'tasks:write',
		writes: true,
		refs: [
			{ arg: 'notebookId', kind: 'notebook' },
			{ arg: 'goalId', kind: 'goal' }
		],
		input: object(
			{
				title: text('What the task is, in the person’s own words.'),
				notes: text('Anything else about it.'),
				scheduledDate: text('The day to put it on, as YYYY-MM-DD. Usually omitted.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this task belongs to, as `notebooks` gives its id. A subject somebody is working through — a renovation, a project — keeps its tasks together, and the app shows them on the notebook itself.'
				},
				goalId: {
					type: 'integer',
					description:
						'A goal to count this towards, as `goals` gives its id. Breaking a goal into tasks is the ordinary reason to make several at once, and a task linked here moves that goal’s progress when it is finished.'
				},
				tags: text(
					'Labels, comma or space separated — "a1, done". The account’s one vocabulary, the same words a diary entry or an idea is tagged with. Mark your own work with a label of your own where several assistants share a list.'
				)
			},
			['title']
		),
		run: (ctx, args) => {
			const id = createTodo(ctx, {
				title: args.title,
				notes: args.notes ?? '',
				notebookId: args.notebookId ?? null,
				tags: args.tags,
				scheduledDate: args.scheduledDate ? day(args.scheduledDate, 'scheduledDate') : null
			});
			/*
			 * Linked in the same call, because the alternative is two calls with a
			 * new id in between and an assistant that forgets the second one half
			 * the time. Additive: it cannot disturb what is already on the goal.
			 */
			if (args.goalId !== undefined) {
				addGoalLinks(ctx, Number(args.goalId), { todoIds: [id] });
			}
			return { id };
		}
	},
	{
		name: 'finish_todo',
		title: 'Finish a todo',
		description:
			'Mark a todo done, which is what "I did that" means here — it is not deleted, it moves to done and stays in the record. Ask `todos` first for the id.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object({ id: { type: 'integer', description: 'The todo’s id.' } }, ['id']),
		run: (ctx, args) => {
			setTodoStatus(ctx, Number(args.id), 'done');
			return { ok: true };
		}
	},
	{
		name: 'drop_todo',
		title: 'Delete a todo',
		description:
			'Remove a todo entirely, because it is not going to happen and is not worth a record — "bin that one", "forget it". Different from `finish_todo`, which keeps it as something that was done. Gone for good; prefer finishing it when it actually happened.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteTodo(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		/*
		 * Both closing verbs have one way back, and it is the same way back.
		 *
		 * `finish_todo` and `drop_todo` each set a status; nothing set it to
		 * `todo` again. So "actually I haven't done that yet" had no answer,
		 * and the workaround is a second row with the same words on it.
		 */
		name: 'reopen_todo',
		title: 'Put a todo back on the list',
		description:
			'Undo a finish or a drop: the todo goes back to not-done. Use it when something was ticked by mistake, or when a dropped thing turns out to matter after all. It keeps its notes, its day and everything linked to it.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			setTodoStatus(ctx, Number(args.id), 'todo');
			return { ok: true };
		}
	},
	{
		/*
		 * Put away, which is neither done nor dropped.
		 *
		 * `finish_todo` says it happened and `drop_todo` says it will not; this
		 * says "not now, and I am not throwing it out". A task keeps everything
		 * about itself, including whether it was half-started, and comes back
		 * exactly as it was — so it needs both directions, as archiving always
		 * does.
		 */
		name: 'archive_todo',
		title: 'Put a todo away for now',
		description:
			'Put a todo out of the way without finishing it or dropping it — for something that matters but not this month. It keeps its notes, its notebook and its state, and comes back with `unarchive_todo`. Prefer this to dropping when somebody says "not now" rather than "not going to".',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			archiveTodo(ctx, Number(args.id), true);
			return { ok: true };
		}
	},
	{
		name: 'unarchive_todo',
		title: 'Bring a todo back',
		description:
			'Bring back a todo that was put away, so it shows on the list again. It returns in whatever state it left in. `todos` says which ones are archived.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			archiveTodo(ctx, Number(args.id), false);
			return { ok: true };
		}
	},
	{
		/*
		 * Labels, added and removed by name.
		 *
		 * `change_todo` takes the whole set and replaces it, which is right for
		 * a form and wrong for a caller that wants to mark one thing: it would
		 * have to read the todo, rebuild the list and write it back, and a
		 * caller that gets that wrong deletes labels somebody else put on.
		 */
		name: 'tag_todo',
		title: 'Label a todo',
		description:
			'Put labels on a todo or take them off, leaving its other labels alone — this is the one to use for marking a task, and `change_todo` is for replacing every label at once. Several assistants sharing a list mark their own work this way; `todos` takes a `tag` to read back only the ones you marked. Answers with the labels it has afterwards.',
		scope: 'tasks:write',
		writes: true,
		/*
		 * The tags it has afterwards are the whole answer. Two copies of the
		 * task around them was most of what a marking run cost, and said
		 * nothing the caller did not send or receive.
		 */
		quiet: true,
		refs: [{ arg: 'id', kind: 'todo', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The todo\u2019s id, as `todos` gives it.' },
				add: text(
					'Labels to put on it, comma or space separated \u2014 "done-by-ai". Lower case, no #; the account\u2019s one vocabulary, the same words a diary entry or an idea is tagged with.'
				),
				remove: text(
					'Labels to take off it, comma or space separated. Ones it does not have are ignored.'
				)
			},
			['id']
		),
		run: (ctx, args) => ({
			id: Number(args.id),
			tags: tagTodo(ctx, Number(args.id), { add: args.add, remove: args.remove })
		})
	},
	{
		name: 'change_todo',
		title: 'Change a todo',
		description:
			'Rewrite a todo\u2019s title, notes or state. Only the fields given change. Moving it on or off a day is `schedule_todo`; `finish_todo` and `reopen_todo` are the shorthands for the two ends of `status`.',
		scope: 'tasks:write',
		writes: true,
		refs: [
			{ arg: 'id', kind: 'todo' },
			{ arg: 'notebookId', kind: 'notebook' }
		],
		input: object(
			{
				id: { type: 'integer', description: 'The todo\u2019s id, as `todos` gives it.' },
				title: text('The new title, in the person\u2019s own words.'),
				notes: text('The new notes.'),
				/*
				 * Started, which had no spelling at all.
				 *
				 * `finish_todo` and `reopen_todo` set the two ends and nothing set
				 * the middle, so "I have begun that one" \u2014 a column on the board,
				 * and what an assistant working a list wants to say before it is
				 * finished \u2014 could only be said by hand in the app.
				 */
				status: {
					type: 'string',
					enum: [...STATUSES],
					description:
						'What state it is in: `todo` waiting, `doing` started, `done` finished, `skipped` given up on. Left out, it is untouched.'
				},
				notebookId: {
					type: 'integer',
					description:
						'The notebook to file it under, as `notebooks` gives its id. `0` takes it out of whichever one it is in. `add_todo` can file a task at birth; this is how one already made moves.'
				},
				tags: text(
					'The labels it should carry from now on, comma or space separated — this replaces whatever it had, so include the ones to keep. An empty string takes them all off. Left out, the labels are untouched.'
				),
				...ratingArgs
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listTodos(ctx).find((t) => t.id === Number(args.id));
			if (!current) throw new NotFoundError('todo');
			updateTodo(ctx, current.id, {
				title: args.title ?? current.title,
				notes: args.notes ?? current.notes,
				categoryId: current.categoryId,
				// Left out means untouched; `''` means take them all off.
				...(args.tags === undefined ? {} : { tags: args.tags }),
				// `0` empties it on purpose: "take this out of the notebook" needs
				// a spelling, and omitting the field already means "leave it be".
				notebookId:
					args.notebookId === undefined
						? current.notebookId
						: Number(args.notebookId) === 0
							? null
							: args.notebookId,
				...(gaveARating(args)
					? {
							ratings: {
								urgency: rating(args.urgency, 'urgency') ?? current.ratings.urgency,
								interest: rating(args.interest, 'interest') ?? current.ratings.interest,
								// `easeOf` also answers for a caller still sending `energy`;
								// null from it means neither was given, so this one is left.
								ease: easeOf(args) ?? current.ratings.ease
							}
						}
					: {})
			});
			// Its own column, and its own validation: a word that is not one of
			// the four is refused rather than written.
			if (args.status !== undefined) setTodoStatus(ctx, current.id, args.status);
			return usedEnergy(args) ? { ok: true, warning: ENERGY_WARNING } : { ok: true };
		}
	},
	{
		name: 'schedule_todo',
		title: 'Put a todo on a day',
		description:
			'Give a todo a date, which moves it onto that day’s board. This is what "do it on Thursday" means here.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object(
			{
				id: { type: 'integer', description: 'The todo’s id.' },
				date: text('The day, as YYYY-MM-DD.')
			},
			['id', 'date']
		),
		run: (ctx, args) => {
			scheduleTodo(ctx, Number(args.id), day(args.date, 'date'));
			return { ok: true };
		}
	},
	{
		name: 'unschedule_todo',
		title: 'Take a todo off its day',
		description:
			'Take the date off a todo, which moves it back to the list of things with no time yet. This is "not today after all" — the todo is kept, it just stops being on a day.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'todo' }],
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			scheduleTodo(ctx, Number(args.id), null);
			return { ok: true };
		}
	},
	{
		name: 'goals',
		title: 'Goals',
		description:
			'What the person is working towards, by horizon, with the work counted against each. `add_goal` transcribes one they just said; `close_goal` says how one ended.',
		scope: 'tasks:read',
		writes: false,
		input: object({ includeClosed: { type: 'boolean', default: false } }),
		run: (ctx, args) => listGoals(ctx, { includeClosed: Boolean(args.includeClosed) })
	},
	{
		/*
		 * Making a goal is a commitment and stays out of here. Saying how one
		 * ended is a report — "I finished the book", "that one is not happening
		 * this year" — and refusing to record it just means it stays open,
		 * counting against a person who already did the thing.
		 */
		name: 'close_goal',
		title: 'Say how a goal ended',
		description:
			'Close a goal: achieved, missed, or abandoned. Missed and abandoned are different — missed is a deadline that passed, abandoned is a decision to stop — and both are worth recording honestly rather than being rounded to one. Takes the id `goals` gives. There is no tool that opens a goal; that is the person\u2019s to make.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'goal' }],
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id.' },
				status: {
					type: 'string',
					enum: ['achieved', 'missed', 'abandoned'],
					description: 'How it ended.'
				},
				note: text('A line about how it went, if they said one.')
			},
			['id', 'status']
		),
		run: (ctx, args) => {
			closeGoal(ctx, Number(args.id), { status: args.status, outcome: args.note });
			return { ok: true };
		}
	},

	// ── Writing ──────────────────────────────────────────────────────────────
	{
		/*
		 * `close_goal` already takes the status the app uses, and `open` is one
		 * of them — but the tool's enum did not offer it, so a goal could be
		 * closed by an assistant and only reopened by hand.
		 */
		/*
		 * Putting existing work against a goal.
		 *
		 * `add_todo` links what it creates, which covers "break this goal into
		 * tasks". This is the other half: work that already exists and turns out
		 * to belong to something.
		 *
		 * Additive on purpose. The page's own save replaces the whole set — it
		 * shows every checkbox, so it can — and a caller that knows about three
		 * todos calling that would silently unlink everything else on the goal.
		 */
		name: 'link_to_goal',
		title: 'Count work towards a goal',
		description:
			'Attach todos or repeating blocks to a goal, so finishing them moves its progress. Adds to what is already linked; nothing is replaced. `goals` gives the goal id and what it already has on it.',
		scope: 'tasks:write',
		writes: true,
		refs: [
			{ arg: 'goalId', kind: 'goal', subject: true },
			{ arg: 'todoIds', kind: 'todo' },
			{ arg: 'slotIds', kind: 'repeatingBlock' }
		],
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal’s id, as `goals` gave it.' },
				todoIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Todo ids, as `todos` gives them.'
				},
				slotIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Ids of repeating blocks, for a goal met by doing something weekly.'
				}
			},
			['goalId']
		),
		run: (ctx, args) =>
			addGoalLinks(ctx, Number(args.goalId), {
				todoIds: (args.todoIds as unknown[]) ?? [],
				slotIds: (args.slotIds as unknown[]) ?? []
			})
	},
	{
		name: 'unlink_from_goal',
		title: 'Take work off a goal',
		description:
			'Detach todos or blocks from a goal. Only the ones named; everything else it counts stays.',
		scope: 'tasks:write',
		writes: true,
		refs: [
			{ arg: 'goalId', kind: 'goal', subject: true },
			{ arg: 'todoIds', kind: 'todo' },
			{ arg: 'slotIds', kind: 'repeatingBlock' }
		],
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal’s id.' },
				todoIds: { type: 'array', items: { type: 'integer' }, description: 'Todo ids.' },
				slotIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Ids of repeating blocks.'
				}
			},
			['goalId']
		),
		run: (ctx, args) =>
			removeGoalLinks(ctx, Number(args.goalId), {
				todoIds: (args.todoIds as unknown[]) ?? [],
				slotIds: (args.slotIds as unknown[]) ?? []
			})
	},
	{
		name: 'reopen_goal',
		title: 'Reopen a goal',
		description:
			'Put a closed goal back to open. Its outcome note is cleared and the date it was closed on goes with it, so a reopened goal does not read as having been finished at some point in the past.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'goal' }],
		input: object({ id: { type: 'integer', description: 'The goal\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			closeGoal(ctx, Number(args.id), { status: 'open' });
			return { ok: true };
		}
	},
	{
		/*
		 * Editing is not committing. The goal exists because the person made
		 * it; a rename, a fixed target or a horizon that turned out wrong is
		 * theirs to ask for. Making one is still not a tool — see `goals`.
		 */
		name: 'change_goal',
		title: 'Change a goal',
		description:
			'Rename a goal, or change its notes, horizon, start date, or what it is measured by. Only the fields given change; `targets` replaces every measure at once, so read `goals` first. Adding one without disturbing the rest is `add_goal_target`. Saying how it ended is `close_goal`, not this.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'goal' }],
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id, as `goals` gives it.' },
				title: text('The new name, in the person\u2019s own words.'),
				notes: text('The new notes.'),
				horizon: text('week, month, quarter, semester or year.'),
				startDate: text('The day its period starts from, as YYYY-MM-DD.'),
				targets: targetsParam,
				targetValue: {
					type: 'number',
					description: 'The number it is aiming at, for a goal that counts one thing.'
				},
				unit: text('What that number counts — pages, km, sessions.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listGoals(ctx, { includeClosed: true }).find((g) => g.id === Number(args.id));
			if (!current) throw new NotFoundError('goal');

			// `targetValue` says "the number this goal counts", which only means
			// something while there is one of them. On a goal measured by several,
			// it is ambiguous rather than wrong, so it is refused with the way to
			// say what was meant.
			if (
				args.targets === undefined &&
				args.targetValue !== undefined &&
				current.targets.length > 1
			)
				throw new ValidationError(
					`That goal is measured by ${current.targets.length} things (${current.targets.map((t) => t.unit || 'unnamed').join(', ')}). Pass \`targets\` to replace them all, or \`add_goal_target\` to add one.`
				);

			updateGoal(ctx, current.id, {
				title: args.title ?? current.title,
				notes: args.notes ?? current.notes ?? '',
				areaId: current.areaId,
				notebookId: current.notebookId,
				targets: targetsFrom(args, current.targets[0]),
				horizon: args.horizon ?? current.horizon,
				startDate: args.startDate ? day(args.startDate, 'startDate') : undefined
			});
			return { ok: true };
		}
	},
	{
		name: 'diary',
		title: 'Recent diary entries',
		description:
			'What has been written lately, newest first. An entry can belong to a notebook or to no notebook at all. Answers with a line and an opening per entry; `verbose` for the writing itself.',
		scope: 'notes:read',
		writes: false,
		input: object({
			limit: count('How many entries.', 20),
			offset: from('the diary'),
			...TAG_ARGS,
			...DETAIL_ARGS
		}),
		run: (ctx, args) => {
			const detail = detailOf(args);
			/*
			 * `seq` here is the diary's own number — the one the entry is headed
			 * with on the page, and the one somebody means by `#12`. The row
			 * also carries the account-wide `seq`, which counts notebook notes
			 * too and so names a different entry.
			 */
			const rows = listEntries(ctx)
				.filter((entry) => passesTags(entry.tags, args))
				.map((entry) => ({ ...entry, seq: entry.diarySeq ?? entry.seq }));
			return sayingTags(paged(rows.map(shapeNote(detail)), args, 20), args);
		}
	},
	{
		name: 'write_entry',
		title: 'Write a diary entry',
		description:
			'Add an entry. Markdown. Writing one when asked is the point of this tool — keep their words and their voice where you have them, and do not invent an entry nobody asked for. Put it in a notebook when it is about one subject; leave the notebook off for an ordinary day.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				content: text('The entry, as Markdown.'),
				title: text(
					'What to call it. Optional: a note without one is listed by its first line, which is right for an ordinary day and wrong for anything somebody will come back looking for.'
				),
				tags: text('Comma-separated tags.'),
				notebookId: { type: 'integer', description: 'The notebook it belongs to, if any.' }
			},
			['content']
		),
		run: (ctx, args) => {
			const id = createEntry(ctx, {
				content: args.content,
				title: args.title ?? '',
				tags: args.tags ?? '',
				notebookId: args.notebookId ?? null
			});
			return { id };
		}
	},
	{
		name: 'notebook_notes',
		title: 'The notes in a notebook',
		description:
			'What has been written against one subject, newest first, with the id of each note. `diary` deliberately shows only entries outside a notebook, so this is the way to read one \u2014 and the way to find the id `archive_note` wants. Answers with a line and an opening per note; `verbose` for the writing itself, `tags` and `taggedSince` to narrow.',
		scope: 'notes:read',
		writes: false,
		refs: [{ arg: 'id', kind: 'notebook' }],
		input: object(
			{
				id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' },
				includeArchived: {
					type: 'boolean',
					description: 'Include the notes that have been put away. Off by default, as on the page.'
				},
				limit: count('How many to return.', 50),
				offset: from('the notebook'),
				...TAG_ARGS,
				...DETAIL_ARGS
			},
			['id']
		),
		run: (ctx, args) => {
			const detail = detailOf(args);
			let notes = contentsOf(ctx, Number(args.id)).entries;
			if (!args.includeArchived) notes = notes.filter((note) => !note.archivedAt);
			notes = notes.filter((note) => passesTags(note.tags, args));
			return sayingTags(paged(notes.map(shapeNote(detail)), args, 50), args);
		}
	},
	{
		name: 'pin_note',
		title: 'Keep a note at the top',
		description:
			'Hold a note at the top of its notebook \u2014 the measurements, the account number, the thing the notebook is actually for. As many as the person likes; the most recently pinned leads. `unpin_note` lets one go.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'note' }],
		input: object(
			{ id: { type: 'integer', description: 'The note\u2019s id, as `notebook_notes` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			pinEntry(ctx, Number(args.id), true);
			return { ok: true };
		}
	},
	{
		name: 'unpin_note',
		title: 'Stop keeping a note at the top',
		description:
			'Let a pinned note fall back into its notebook\u2019s own order, where it is read with the rest.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'note' }],
		input: object(
			{ id: { type: 'integer', description: 'The note\u2019s id, as `notebook_notes` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			pinEntry(ctx, Number(args.id), false);
			return { ok: true };
		}
	},
	{
		/*
		 * Hidden, not deleted \u2014 which is why an assistant may do it.
		 *
		 * Deleting somebody's writing is theirs to do in the app. Putting a note
		 * out of the way destroys nothing: it stays in its notebook, keeps its
		 * number, its tags and the people it is about, and comes back unchanged.
		 */
		/*
		 * Editing what is written, which the tools could not do at all.
		 *
		 * `write_entry` made one and `archive_note` put one away, so the only
		 * way to correct a note over the API was to write a second one and hide
		 * the first. A person asked to turn their own note into todos and then
		 * tidy it could do neither half.
		 *
		 * A field left out keeps what it had, including the notebook: an edit
		 * that said nothing about where the note lives used to move it out,
		 * because `undefined` read as "no notebook" rather than as "not my
		 * business". Deletion is still not offered — a note is deleted by the
		 * person, in the app.
		 */
		name: 'edit_entry',
		title: 'Change what a note says',
		description:
			'Rewrite a note or a diary entry — its words, its title, its tags. Only the fields given change; the rest of it, and the notebook it lives in, are left alone. `notebook_notes` gives the id. To put one out of the way instead, `archive_note`.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'note', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The note\u2019s id, as `notebook_notes` gives it.' },
				content: text('The new words, as Markdown. Left out, the writing is untouched.'),
				title: text(
					'What to call it. Left out, the name is untouched; an empty string takes the name off, which is what an ordinary day\u2019s diary entry has.'
				),
				tags: text(
					'The tags it should carry from now on, comma or space separated \u2014 this replaces the ones it has. Left out, they are untouched.'
				)
			},
			['id']
		),
		subject: (ctx, args) => getEntry(ctx, Number(args.id)),
		run: (ctx, args) => {
			const now = getEntry(ctx, Number(args.id));
			updateEntry(ctx, now.id, {
				content: args.content ?? now.content,
				...(args.title === undefined ? {} : { title: args.title }),
				...(args.tags === undefined ? {} : { tags: args.tags })
			});
			return { ok: true };
		}
	},
	{
		name: 'note_to_todos',
		title: 'Make todos out of a checklist note',
		description:
			'Turn a note that is really a checklist into the tasks it describes. Every `- [ ]` line becomes a task, with whatever is written under it as that task\u2019s notes; a `- [x]` line comes across already done. Each is filed under the note\u2019s own notebook, and each box is replaced by a reference to the task it became \u2014 `TASK:#4` \u2014 so the note keeps its words and stops being a second copy of the list.',
		scope: 'tasks:write',
		alsoNeeds: 'notes:read',
		writes: true,
		refs: [{ arg: 'id', kind: 'note', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The note\u2019s id, as `notebook_notes` gives it.' },
				only: {
					type: 'array',
					items: { type: 'integer' },
					description:
						'Which checkboxes to take, counting from 0 down the note. Left out, all of them.'
				}
			},
			['id']
		),
		subject: (ctx, args) => getEntry(ctx, Number(args.id)),
		run: (ctx, args) => {
			const only = Array.isArray(args.only) ? args.only.map(Number) : undefined;
			const made = makeTodosFromEntry(ctx, Number(args.id), only);
			return { ok: true, made: made.ids.length, ids: made.ids };
		}
	},
	{
		name: 'archive_note',
		title: 'Put a note away',
		description:
			'Hide a note without deleting it \u2014 for one that has stopped being current and is not something to throw out: the trip is over, the flat is rented. It stays in its notebook and comes back with `unarchive_note`. Notes are never deleted through a tool.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'note' }],
		input: object(
			{ id: { type: 'integer', description: 'The note\u2019s id, as `notebook_notes` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			archiveEntry(ctx, Number(args.id), true);
			return { ok: true };
		}
	},
	{
		name: 'unarchive_note',
		title: 'Bring a note back',
		description:
			'Bring back a note that was put away, so it shows in its notebook again. `notebook_notes` with `includeArchived` says which ones are away.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'note' }],
		input: object({ id: { type: 'integer', description: 'The note\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			archiveEntry(ctx, Number(args.id), false);
			return { ok: true };
		}
	},
	/*
	 * The subjects, and the one question a confined key could not ask.
	 *
	 * This took no arguments, which meant it named no `notebook` reference,
	 * which meant a key tied to one notebook was never offered it at all — see
	 * `withinConfinement`. So the assistant that can only work on one subject
	 * was the one assistant that could not find out which subject that is, or
	 * the id every other tool asks it for. It had to learn its own id from the
	 * answer to a write.
	 *
	 * The `id` argument fixes it without a second tool: unset it lists
	 * everything, and for a confined key `confine` pins it to the one notebook
	 * that key can reach, which is the honest answer to "which notebooks do I
	 * have?"
	 */
	{
		name: 'notebooks',
		title: 'Notebooks',
		description:
			'The subjects being written against \u2014 a trip, a renovation, a book \u2014 with the id every other tool means by `notebookId`. Ask for these before writing an entry into one. A key tied to one notebook is answered with that one. `modules` is what each one holds: the tabs it shows, which is also what it will accept being filed under it.',
		scope: 'notes:read',
		writes: false,
		refs: [{ arg: 'id', kind: 'notebook' }],
		input: object({
			id: {
				type: 'integer',
				description:
					'Only this one, by its id. Usually left off; a confined key is pinned to its own.'
			}
		}),
		run: (ctx, args) => {
			const all = listNotebooks(ctx);
			return args.id === undefined ? all : all.filter((one) => one.id === Number(args.id));
		}
	},
	{
		name: 'add_notebook',
		title: 'Make a notebook',
		description:
			'Make a notebook — a subject written against with no deadline: a book, a trip, a renovation. `write_entry` files notes into it by name.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				title: text('What it is about.'),
				description: text('A line under the title, shown on its page.'),
				defaultTags: text(
					'Labels a new note in it starts with, comma or space separated \u2014 the ones writing about this subject always carries, so nobody types them on every note. The person can still take them off a note as they write it.'
				),
				modules: text(
					'What it holds, comma separated \u2014 notes, tasks, goals, ideas, inventory, ledgers, bills, habits, workouts, recipes. Notes and tasks unless this says otherwise, and notes are always in it. Only name what the subject actually accumulates: nine tabs on a reading list is the app deciding what somebody\u2019s subject is about.'
				)
			},
			['title']
		),
		run: (ctx, args) => ({
			id: createNotebook(ctx, {
				title: args.title,
				description: args.description,
				defaultTags: args.defaultTags,
				modules: args.modules
			})
		})
	},
	{
		name: 'change_notebook',
		title: 'Change a notebook',
		description:
			'Rename a notebook, rewrite the line under its title, set the labels a new note in it starts with, or change what it holds. The title is always sent; the rest change only when given.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'notebook', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' },
				title: text('What it is about. Renaming with the \u2014 separator moves it under another.'),
				description: text('A line under the title, shown on its page.'),
				defaultTags: text(
					'Labels a new note in it starts with, comma or space separated. An empty string clears them; left out, they are untouched.'
				),
				modules: text(
					'What it holds, comma separated \u2014 notes, tasks, goals, ideas, inventory, ledgers, bills, habits, workouts, recipes. The whole list, not an addition. Notes are always in it. Switching one off keeps whatever is already filed under it; it stops being a tab, and stays in its own room.'
				)
			},
			['id', 'title']
		),
		run: (ctx, args) => {
			updateNotebook(ctx, Number(args.id), {
				title: args.title,
				description: args.description,
				defaultTags: args.defaultTags,
				modules: args.modules
			});
			return { id: Number(args.id) };
		}
	},
	{
		/*
		 * The one notebook deletion an assistant gets: an empty one.
		 *
		 * Notebooks with anything in them are under the same rule as people,
		 * habits and goals — never deletable through a tool, because what they
		 * hold is somebody's writing. But a notebook made by mistake a minute
		 * ago holds nothing, and "remove it in the app yourself" for a thing
		 * the assistant just created is ceremony with no one to protect.
		 */
		name: 'remove_notebook',
		title: 'Remove an empty notebook',
		description:
			'Delete a notebook that holds nothing \u2014 no notes, no tasks, nothing filed under it at all. One with anything in it is refused with what it holds: somebody\u2019s writing is deleted by them in the app, never through a tool. For a notebook made by mistake.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'notebook' }],
		destroys: true,
		input: object(
			{ id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			/*
			 * Empty means empty of everything, not of the three it used to hold.
			 *
			 * A notebook can hold its subject's shopping, its bills and the
			 * account it is paid from now. Counting only notes, tasks and goals
			 * would let an assistant delete a renovation that holds forty items
			 * because nobody had written a note in it.
			 */
			const notebook = getNotebook(ctx, Number(args.id));
			const held = Object.entries(notebook.counts).filter(([, n]) => n > 0);
			if (held.length > 0)
				throw new ValidationError(
					`That notebook holds ${held.map(([what, n]) => `${n} ${what}`).join(', ')}. What is filed under it is deleted by the person, in the app — not through a tool.`
				);
			deleteNotebook(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'share_notebook',
		title: 'Share a notebook with the family',
		description:
			'Share one of the person\u2019s notebooks with everybody on their family plan — they read it and write their own entries into it — or stop sharing with `shared: false`. Only its owner\u2019s to flip, and only when they asked.',
		scope: 'notes:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'notebook' }],
		input: object(
			{
				id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' },
				shared: { type: 'boolean', description: 'False stops the sharing. True if left out.' }
			},
			['id']
		),
		run: (ctx, args) => {
			setNotebookShared(
				ctx,
				Number(args.id),
				args.shared === undefined ? true : Boolean(args.shared)
			);
			return { ok: true };
		}
	},
	{
		name: 'ideas',
		title: 'Ideas',
		description:
			'Things caught before they evaporated, newest first. An idea is not a task: nobody has committed to doing it, which is what makes it cheap to write down.',
		scope: 'ideas:read',
		writes: false,
		input: object({ limit: count('How many.', 50), offset: from('the ideas') }),
		run: (ctx, args) => paged(listIdeas(ctx), args, 50)
	},
	{
		name: 'add_idea',
		title: 'Catch an idea',
		description:
			'Write an idea down without deciding where it belongs. The lowest-friction thing here; prefer it to a todo when the person has not said they will do it.',
		scope: 'ideas:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				content: text('The idea.'),
				tags: text('Comma-separated tags.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['content']
		),
		run: (ctx, args) => ({
			id: createIdea(ctx, {
				content: args.content,
				tags: args.tags ?? '',
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			})
		})
	},

	// ── The kitchen and the list ─────────────────────────────────────────────
	{
		/*
		 * Anything an assistant can create, it has to be able to take back.
		 * `add_idea` with no `remove_idea` means a misheard sentence is a row
		 * somebody else has to go and delete.
		 */
		name: 'remove_idea',
		title: 'Delete an idea',
		description:
			'Delete an idea — for one added by mistake, or one that has been dealt with. It is gone, not archived, so prefer leaving it alone unless the person asked.',
		scope: 'ideas:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'idea' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The idea\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteIdea(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'change_idea',
		title: 'Change an idea',
		description:
			'Rewrite an idea, or retag it. Only the fields given change — this is for a misheard word or a better tag, not for turning it into something else.',
		scope: 'ideas:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'idea' }],
		input: object(
			{
				id: { type: 'integer', description: 'The idea\u2019s id, as `ideas` gives it.' },
				content: text('The idea, rewritten.'),
				tags: text('Comma-separated tags, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listIdeas(ctx).find((i) => i.id === Number(args.id));
			if (!current) throw new NotFoundError('idea');
			updateIdea(ctx, current.id, {
				content: args.content ?? current.content,
				tags: args.tags ?? current.tags.map((t) => t.name).join(', ')
			});
			return { ok: true };
		}
	},
	// ── The one vocabulary ────────────────────────────────────
	/*
	 * Labels as things in themselves, rather than as a property of what wears
	 * them.
	 *
	 * Every other tool reads a tag off a task or a note. These three are the
	 * account's vocabulary itself — which is why they answer to `tags:*` and
	 * not to the room the label happens to be used in: renaming one reaches
	 * into every room at once.
	 */
	{
		name: 'tags',
		title: 'The labels',
		description:
			'Every label the account uses, alphabetically, with the colour it wears and how many things carry it. One vocabulary for the whole app — the same word on a task, a note, an idea, a block and a picture.',
		scope: 'tags:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ tags: tagsWithUses(ctx.userId) })
	},
	{
		/*
		 * The same vocabulary, seen from one subject.
		 *
		 * `tags` counts a word across the whole account, which is the wrong
		 * answer to "what is this renovation actually about": `#home` doing
		 * forty things somewhere says nothing about why it is on this. Here the
		 * count is the notebook's own, and it is broken down by what carries
		 * it, so an assistant asked to label something the way this subject
		 * labels things has the subject's words rather than the account's.
		 *
		 * `refs` is what keeps it honest: `notebookId` is declared as naming a
		 * notebook, so the reference machinery resolves it against what this
		 * token may list before `run` is ever called. A notebook belonging to
		 * somebody else, or to a notebook this key is confined away from,
		 * answers exactly as one that was never there — and the service reads
		 * `ctx.userId` on every join besides, so a stranger's id would come
		 * back empty even if it got this far.
		 */
		name: 'notebook_tags',
		title: 'The labels in one notebook',
		description:
			'The labels on what is filed under one subject, with how much of it carries each — and what kind: notes, tasks, ideas. Narrower than `tags`, which counts a word across the whole account, and the one to ask before labelling something the way this notebook labels things. A label the notebook suggests by default is listed at nought.',
		scope: 'tags:read',
		writes: false,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		alsoNeeds: 'notes:read',
		input: object(
			{
				notebookId: {
					type: 'integer',
					description: 'The notebook, as `notebooks` gives its id.'
				}
			},
			['notebookId']
		),
		run: (ctx, args) => ({ tags: tagsInNotebook(ctx.userId, Number(args.notebookId)) })
	},
	{
		name: 'describe_tag',
		title: 'Say what a label means',
		description:
			'Write down what a word means in this account — `#short` on the shopping is low on something, `#short` on a book is the book. One line; an empty one takes the meaning off again. The label itself is not changed: `rename_tag` is for that.',
		scope: 'tags:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'tag' }],
		input: object(
			{
				id: { type: 'integer', description: 'The label’s id, as `tags` gives it.' },
				description: text('What the word means here. Empty takes it off again.')
			},
			['id']
		),
		run: (ctx, args) => describeTag(ctx.userId, Number(args.id), args.description ?? '')
	},
	{
		name: 'rename_tag',
		title: 'Rename a label',
		description:
			'Rename a label everywhere at once — for a typo, or for two words that turned out to mean one thing. Renaming onto a name the account already uses merges the two: everything that carried the old label carries the surviving one, and the old label stops existing. Answers with the label that survived.',
		scope: 'tags:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'tag', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The label\u2019s id, as `tags` gives it.' },
				name: text(
					'The new name — one word, lower case, no #. A name the account already uses merges the two labels.'
				)
			},
			['id', 'name']
		),
		run: (ctx, args) => renameTag(ctx.userId, Number(args.id), args.name)
	},
	{
		name: 'recolor_tag',
		title: 'Colour a label',
		description:
			'Give a label a colour, so it is drawn in it wherever a chip for it appears. An empty string takes the colour off again, which is the plain chip every label starts as.',
		scope: 'tags:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'tag', subject: true }],
		input: object(
			{
				id: { type: 'integer', description: 'The label\u2019s id, as `tags` gives it.' },
				color: text('The colour as `#rrggbb` — `#0f766e`. An empty string takes it off.')
			},
			['id', 'color']
		),
		run: (ctx, args) => recolorTag(ctx.userId, Number(args.id), args.color)
	},
	{
		name: 'remove_tag',
		title: 'Delete a label',
		description:
			'Take a label out of the vocabulary and off everything that carried it — the tasks, notes, ideas, blocks and pictures keep everything else about them. Nothing is archived; the label is gone. To fold it into another label instead, `rename_tag` onto that one.',
		scope: 'tags:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'tag' }],
		/*
		 * A label is small and a delete is a delete: this one reaches across
		 * every room at once, so it wants the grant that says so.
		 */
		destroys: true,
		input: object(
			{ id: { type: 'integer', description: 'The label\u2019s id, as `tags` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			deleteTag(ctx.userId, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'shopping_list',
		title: 'The shopping list',
		description:
			'What is to buy and what is already in the cupboard. An item is a thing, not a line: ticking it bought puts it back in the cupboard rather than deleting it. Each carries how many there are and how many are kept, so "what am I short of" is `qty` below `idealQty` — `short: true` asks for exactly those.',
		scope: 'inventory:read',
		writes: false,
		input: object({
			short: {
				type: 'boolean',
				description:
					'Only the things there are fewer of than are kept — what an actual shopping trip is for.'
			}
		}),
		run: (ctx, args) => {
			const items = listItems(ctx);
			return args.short === true
				? items.filter((item) => item.type === 'replenish' && item.qty < item.idealQty)
				: items;
		}
	},
	{
		name: 'add_inventory_item',
		title: 'Add to the shopping list',
		description:
			'Put something on the list. If the cupboard already has it, this says so rather than adding a second one.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				name: text('What to buy.'),
				type: {
					type: 'string',
					enum: ['replenish', 'someday'],
					description:
						'`replenish` is something the cupboard runs out of and wants again; `someday` is a wishlist item. Default `replenish`.',
					default: 'replenish'
				},
				notes: text('Anything else about it.'),
				section: text('The section to file it under, by name — `inventory_categories` lists them.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['name']
		),
		run: (ctx, args) => {
			let inventoryCategoryId: number | undefined;
			const said = typeof args.section === 'string' ? args.section.trim().toLowerCase() : '';
			if (said) {
				const all = listInventoryCategories(ctx) as { id: number; name: string }[];
				const hit =
					all.find((c) => c.name.toLowerCase() === said) ??
					all.find((c) => c.name.toLowerCase().includes(said));
				if (!hit)
					throw new ValidationError(
						`No section called "${String(args.section)}". Call \`inventory_categories\` for the names.`
					);
				inventoryCategoryId = hit.id;
			}
			return createItem(ctx, {
				name: args.name,
				type: args.type ?? 'replenish',
				notes: args.notes ?? '',
				...(inventoryCategoryId !== undefined ? { inventoryCategoryId } : {}),
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			});
		}
	},
	{
		name: 'tick_bought',
		title: 'Tick something bought',
		description:
			'Mark an item bought, which moves it out of "to buy" and into the cupboard. The row stays: the same thing is bought again the next time it runs out.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object({ id: { type: 'integer', description: 'The item’s id.' } }, ['id']),
		run: (ctx, args) => setBought(ctx, Number(args.id), true)
	},
	{
		/*
		 * The way back out of the cupboard.
		 *
		 * Every verb here had exactly one direction, and an assistant tidying a
		 * list found the wall immediately: it could tick a thing bought and it
		 * could delete a row, so the only way to undo a mistaken tick was to
		 * destroy the item and make a new one — losing its category, its notes
		 * and every price ever recorded against it. A one-way tool does not
		 * produce a refusal; it produces a workaround, and the workaround is
		 * always worse than the thing it stands in for.
		 */
		name: 'untick_bought',
		title: 'Put something back on the list',
		description:
			'Undo a tick: the item comes out of the cupboard and back onto "to buy". Use it when something was marked bought by mistake, or when it has run out again. Nothing is lost either way — the row, its category and its price history are the same row.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setBought(ctx, Number(args.id), false)
	},
	{
		/*
		 * Snoozing is how the list stays short without anybody losing anything,
		 * so it needs both directions for the same reason ticking does.
		 */
		name: 'archive_item',
		title: 'Put something aside for now',
		description:
			'Put an item away without deleting it — for something not wanted this week. It keeps everything about itself and comes back with `unarchive_item`. Prefer this to removing when somebody says "not now" rather than "never".',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setSnoozed(ctx, Number(args.id), true)
	},
	{
		name: 'unarchive_item',
		title: 'Bring something back to the list',
		description:
			'Bring back an item that was put away, so it shows on the list again. `shopping_list` says which items are archived.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setSnoozed(ctx, Number(args.id), false)
	},
	{
		name: 'remove_inventory_item',
		title: 'Take something off the shopping list',
		description:
			'Remove an item because it is not wanted — "take milk off", "we already have that". Not the same as `tick_bought`, which records that it *was* bought and keeps it in the history and the price record. Takes the id `shopping_list` gives.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteItem(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'recipes',
		title: 'Recipes',
		description:
			'Every recipe, with its ingredients. An ingredient here is a shopping item with an amount, which is what lets a meal on a day fill the shopping list.',
		scope: 'kitchen:read',
		writes: false,
		refs: [{ arg: 'id', kind: 'recipe' }],
		input: object({ id: { type: 'integer', description: 'One recipe, in full.' } }),
		run: (ctx, args) => {
			if (!args.id) return listRecipes(ctx);
			const id = Number(args.id);
			return { ...getRecipe(ctx, id), ingredients: ingredientsOf(ctx, id) };
		}
	},
	{
		name: 'add_recipe',
		title: 'Add a recipe',
		description:
			'Write a recipe down. Ingredients are one per line — "200 g flour", "2 eggs" — and each becomes a shopping item, so the list knows about them the day the meal is planned.',
		scope: 'kitchen:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				title: text('What it is called.'),
				ingredients: text('One per line, quantity first.'),
				method: text('How to make it, as Markdown.'),
				servings: { type: 'integer', description: 'How many it feeds.' },
				minutes: { type: 'integer', description: 'How long it takes.' },
				source: text('Where it came from.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['title']
		),
		run: (ctx, args) => {
			const id = createRecipe(ctx, {
				title: args.title,
				method: args.method ?? '',
				notes: '',
				servings: args.servings ?? null,
				minutes: args.minutes ?? null,
				source: args.source ?? '',
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			});
			// The ingredients are a second call because each one becomes a shopping
			// item: `importIngredients` is the same parser the paste box uses, so a
			// recipe added here and one pasted in behave identically afterwards.
			const added = args.ingredients ? importIngredients(ctx, id, args.ingredients) : 0;
			return { id, ingredients: added };
		}
	},
	{
		/*
		 * `kitchen:write`\u2019s sentence has promised "add and change recipes"
		 * since the scope was written; this is the change half. Ingredients are
		 * additive here — replacing the whole set from a partial list would
		 * silently delete shopping items other meals point at.
		 */
		name: 'change_recipe',
		title: 'Change a recipe',
		description:
			'Change a recipe\u2019s title, method, servings, time or source, and add ingredients — one per line, quantity first. Only the fields given change, and existing ingredients stay.',
		scope: 'kitchen:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'recipe' }],
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id, as `recipes` gives it.' },
				title: text('The new name.'),
				method: text('How to make it, as Markdown.'),
				ingredients: text('Ingredients to add, one per line.'),
				servings: { type: 'integer', description: 'How many it feeds.' },
				minutes: { type: 'integer', description: 'How long it takes.' },
				source: text('Where it came from.')
			},
			['id']
		),
		run: (ctx, args) => {
			const id = Number(args.id);
			const current = getRecipe(ctx, id);
			updateRecipe(ctx, id, {
				title: args.title ?? current.title,
				method: args.method ?? current.method,
				notes: current.notes,
				servings: args.servings ?? current.servings,
				minutes: args.minutes ?? current.minutes,
				source: args.source ?? current.source
			});
			const added = args.ingredients ? importIngredients(ctx, id, args.ingredients) : 0;
			return { ok: true, ingredients: added };
		}
	},
	{
		name: 'cooked_recipe',
		title: 'Say a recipe was cooked',
		description:
			'Record that a meal was made — `recipes` shows when each was last cooked, and this is what sets it. Name the ingredient ids that ran out and they land back on the shopping list, which is the loop the kitchen exists to close.',
		scope: 'kitchen:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'recipe' }],
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id, as `recipes` gives it.' },
				ranOutOf: {
					type: 'array',
					items: { type: 'integer' },
					description:
						'Ingredient item ids that were used up, as the recipe\u2019s ingredient list gives them.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			cooked(ctx, Number(args.id), ((args.ranOutOf as unknown[]) ?? []).map(Number));
			return { ok: true };
		}
	},
	{
		name: 'archive_recipe',
		title: 'Put a recipe away',
		description:
			'Archive a recipe — out of the everyday list, not deleted — or bring one back with `archived: false`. For the dish nobody makes any more that somebody may yet ask for.',
		scope: 'kitchen:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'recipe' }],
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'False brings it back. True if left out.',
					default: true
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setArchived(
				ctx,
				Number(args.id),
				args.archived === undefined ? true : Boolean(args.archived)
			);
			return { ok: true };
		}
	},
	{
		name: 'file_inventory_item',
		title: 'File an item into a section',
		description:
			'Move a shopping item into a section — "put the milk under Dairy". Takes the item\u2019s id from `shopping_list` and the section by name from `inventory_categories`; an empty section name unfiles it. A name matching no section is refused with the ones that exist.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id, as `shopping_list` gives it.' },
				section: text('The section, by name. Empty unfiles the item.')
			},
			['id']
		),
		run: (ctx, args) => {
			const said = typeof args.section === 'string' ? args.section.trim().toLowerCase() : '';
			let categoryId: number | null = null;
			if (said) {
				const all = listInventoryCategories(ctx) as { id: number; name: string }[];
				const hit =
					all.find((c) => c.name.toLowerCase() === said) ??
					all.find((c) => c.name.toLowerCase().includes(said));
				if (!hit)
					throw new ValidationError(
						`No section called "${String(args.section)}". Call \`inventory_categories\` for the names.`
					);
				categoryId = hit.id;
			}
			setItemCategory(ctx, Number(args.id), categoryId);
			return { ok: true };
		}
	},
	{
		name: 'inventory_categories',
		title: 'The shopping list\u2019s sections',
		description:
			'How the shopping list is sectioned — produce, cleaning, whatever the person keeps. Read it before filing an item somewhere.',
		scope: 'inventory:read',
		writes: false,
		input: object({}),
		run: (ctx) => listInventoryCategories(ctx)
	},
	{
		name: 'add_inventory_category',
		title: 'Add a shopping section',
		description:
			'Make a new section for the shopping list — and say whether it holds food, because only food sections can feed recipes as ingredients.',
		scope: 'inventory:write',
		writes: true,
		input: object(
			{
				name: text('The section\u2019s name — "Frozen", "Cleaning".'),
				holdsFood: {
					type: 'boolean',
					description: 'Whether what is in it is food. Off if left out.'
				}
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createInventoryCategory(ctx, { name: args.name, isFood: args.holdsFood === true })
		})
	},
	{
		name: 'change_inventory_category',
		title: 'Rename a shopping section',
		description:
			'Rename a section, or change whether it holds food. Only the fields given change; the items filed under it stay exactly where they are.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'inventoryCategory' }],
		input: object(
			{
				id: {
					type: 'integer',
					description: 'The section\u2019s id, as `inventory_categories` gives it.'
				},
				name: text('The new name.'),
				holdsFood: { type: 'boolean', description: 'Whether what is in it is food.' },
				shareWithFamily: {
					type: 'boolean',
					description:
						'Share the section with everybody on the family plan, or stop. Only its owner\u2019s to flip.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			if (args.name !== undefined && args.name !== null && args.name !== '')
				renameCategory(ctx, Number(args.id), args.name);
			if (args.holdsFood !== undefined && args.holdsFood !== null)
				setCategoryFood(ctx, Number(args.id), Boolean(args.holdsFood));
			if (args.shareWithFamily !== undefined && args.shareWithFamily !== null)
				setCategoryShared(ctx, Number(args.id), Boolean(args.shareWithFamily));
			return { ok: true };
		}
	},
	{
		name: 'remove_inventory_category',
		title: 'Delete a shopping section',
		description:
			'Delete a section. Its items are not touched — they stay on the list, just unfiled. A section is a shelf label, and removing the label must not empty the shelf.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'inventoryCategory' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The section\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteShoppingCategory(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'record_price',
		title: 'Record what an item cost',
		description:
			'Write down what was paid for a shopping item — "milk was 6,50 today". The list keeps a small price history per item, which is how it can notice drift. Takes the id `shopping_list` gives, and the price as the person said it.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id.' },
				price: text('The price, in the account\u2019s own currency — "6,50" or "6.50" both work.')
			},
			['id', 'price']
		),
		run: (ctx, args) => {
			recordPaid(ctx, Number(args.id), args.price);
			return { ok: true };
		}
	},

	// ── Goals, and where they stand ──────────────────────────────────────────
	{
		/*
		 * Creation arrived late, and the earlier refusal is kept in the words:
		 * a goal is a commitment the person makes. This transcribes one they
		 * just said — it must never be a way for an assistant to invent one.
		 */
		name: 'add_goal',
		title: 'Write down a goal they made',
		description:
			'Transcribe a goal the person just committed to, in their own words — "apply to twenty companies this quarter". Never invent one, and never add a goal they did not say: a goal is a commitment, and the commitment is theirs. `goal_areas` lists the areas one can be filed under.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				title: text('The goal, in the person\u2019s own words.'),
				horizon: text('week, month, quarter, semester or year.'),
				notes: text('Anything else they said about it.'),
				startDate: text('The day its period starts from, as YYYY-MM-DD. Today if left out.'),
				area: text('The area to file it under, by name — `goal_areas` lists them.'),
				targets: targetsParam,
				targetValue: {
					type: 'number',
					description: 'The number it aims at, when it counts one thing.'
				},
				unit: text('What that number counts — applications, km, pages.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook it belongs to, as `notebooks` gives it — a goal that is part of one subject rather than the year in general.'
				}
			},
			['title', 'horizon']
		),
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		run: (ctx, args) => {
			let areaId: number | undefined;
			if (args.area !== undefined && args.area !== null && args.area !== '') {
				const areas = listAreas(ctx);
				const said = String(args.area).trim().toLowerCase();
				const hit = areas.find((a) => a.name.toLowerCase() === said);
				if (!hit)
					throw new ValidationError(
						`No area called "${String(args.area)}". This account has: ${areas.map((a) => a.name).join(', ') || 'none yet'}.`
					);
				areaId = hit.id;
			}
			const id = createGoal(ctx, {
				title: args.title,
				horizon: args.horizon,
				notes: args.notes,
				startDate: args.startDate,
				areaId,
				notebookId: args.notebookId,
				targets: targetsFrom(args)
			});
			return { id };
		}
	},
	{
		/*
		 * A goal's number used to move only when a linked todo finished, so a
		 * goal counted by hand — CVs sent, pages read — sat at zero however
		 * much was done. Saying "I sent three today" is a report, and reports
		 * get recorded. A goal measured by several things says which one.
		 */
		name: 'log_goal_progress',
		title: 'Move a goal\u2019s number',
		description:
			'Record progress on a goal that counts something: pass `value` to set where it stands, or `delta` to add what just happened — "I sent three more CVs" is `delta: 3`. Exactly one of the two. A goal measured by several things also needs `unit`, to say which of them moved; `goals` shows them and where each stands.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'goal' }],
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id.' },
				value: { type: 'number', description: 'Where it stands now, absolute.' },
				delta: { type: 'number', description: 'How much just happened, added to where it stands.' },
				unit: text('Which measure moved, by its unit — only needed when the goal has several.')
			},
			['id']
		),
		run: (ctx, args) => {
			const gaveValue = args.value !== undefined && args.value !== null;
			const gaveDelta = args.delta !== undefined && args.delta !== null;
			if (gaveValue === gaveDelta)
				throw new ValidationError('Say either `value` or `delta` — exactly one.');

			const current = listGoals(ctx, { includeClosed: true }).find((g) => g.id === Number(args.id));
			if (!current) throw new NotFoundError('goal');

			const target = pickTarget(current, args.unit);
			const next = gaveValue ? Number(args.value) : target.currentValue + Number(args.delta);
			setTargetProgress(ctx, target.id, next);
			return { ok: true, unit: target.unit, currentValue: next, targetValue: target.targetValue };
		}
	},
	{
		/*
		 * A goal can want several things at once, and finding out midway that it
		 * wants a fourth is ordinary. Additive, for the same reason
		 * `link_to_goal` is: `change_goal`'s `targets` replaces the set, and a
		 * caller that knows about one measure would drop the others.
		 */
		name: 'add_goal_target',
		title: 'Add something a goal is measured by',
		description:
			'Give a goal another measure — "and fifty kilometres run". Leaves the measures already on it alone, and starts at zero. `goals` shows what it is measured by.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'goalId', kind: 'goal', subject: true }],
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal\u2019s id, as `goals` gives it.' },
				value: { type: 'number', description: 'How much of it.' },
				unit: text('What is being counted — gigs, songs, km.'),
				measure: text(
					'A workout measure this counts, in the word the sessions use \u2014 "ran", "deadlifted". Set it and the number is the sum of what the register holds for that activity inside the goal\u2019s period, read rather than typed; `workout_sessions` and `workouts` show what has been measured. Leave it off for a number the person keeps themselves.'
				)
			},
			['goalId', 'value']
		),
		run: (ctx, args) => ({
			id: addGoalTarget(ctx, Number(args.goalId), {
				value: args.value,
				unit: args.unit,
				measureActivity: args.measure
			})
		})
	},
	{
		name: 'remove_goal_target',
		title: 'Take a measure off a goal',
		description:
			'Drop one of the things a goal is measured by, by its unit. The goal and its other measures stay. For a measure that was a mistake — one that simply did not happen is what `close_goal` is for.',
		scope: 'tasks:write',
		writes: true,
		refs: [{ arg: 'goalId', kind: 'goal', subject: true }],
		destroys: true,
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal\u2019s id.' },
				unit: text(
					'The measure\u2019s unit, as `goals` gives it. Only needed when there are several.'
				)
			},
			['goalId']
		),
		run: (ctx, args) => {
			const goal = listGoals(ctx, { includeClosed: true }).find(
				(g) => g.id === Number(args.goalId)
			);
			if (!goal) throw new NotFoundError('goal');
			const target = pickTarget(goal, args.unit);
			removeGoalTarget(ctx, target.id);
			return { ok: true, unit: target.unit };
		}
	},
	{
		name: 'goal_areas',
		title: 'The areas goals are filed under',
		description:
			'The areas of life a goal can belong to — career, health, whatever the person keeps. Read it before filing a goal; `add_goal_area` makes a missing one.',
		scope: 'tasks:read',
		writes: false,
		input: object({}),
		run: (ctx) => listAreas(ctx)
	},
	{
		name: 'add_goal_area',
		title: 'Add a goal area',
		description:
			'Make a new area to file goals under. Only when the person named one that does not exist — `goal_areas` says what already does.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				name: text('The area\u2019s name.'),
				color: text('A hex colour like #1d4ed8, if they chose one.')
			},
			['name']
		),
		run: (ctx, args) => ({ id: createArea(ctx, { name: args.name, color: args.color }) })
	},

	// ── Habits, whole ────────────────────────────────────────────────────────
	{
		name: 'all_habits',
		title: 'Every habit',
		description:
			'The full list of habits, due today or not — id, name, type and which days each is scheduled. `habits` is today\u2019s view with streaks; this is the one to read before adding or changing one.',
		scope: 'habits:read',
		writes: false,
		input: object({}),
		run: (ctx) => listHabits(ctx)
	},
	{
		name: 'add_habit',
		title: 'Add a habit',
		description:
			'Start tracking a habit: something to keep doing (`good`), to avoid (`bad`), or just to watch (`neutral`). Scheduled days come in the same shape `all_habits` shows for existing ones; leave them out for every day.',
		scope: 'habits:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				name: text('The habit, in the person\u2019s own words.'),
				type: {
					type: 'string',
					enum: [...HABIT_TYPES],
					description: 'good to keep, bad to avoid, neutral to watch.'
				},
				description: text('Anything else about it.'),
				scheduledDays: text(
					'The days it is due, in the shape `all_habits` shows. Every day if left out.'
				),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createHabit(ctx, {
				name: args.name,
				type: args.type,
				description: args.description,
				scheduledDays: args.scheduledDays,
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			})
		})
	},
	{
		name: 'change_habit',
		title: 'Change a habit',
		description:
			'Rename a habit or change its type, description or days. Only the fields given change; its history of kept days stays exactly as it was.',
		scope: 'habits:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'habit' }],
		input: object(
			{
				id: { type: 'integer', description: 'The habit\u2019s id, as `all_habits` gives it.' },
				name: text('The new name.'),
				type: { type: 'string', enum: [...HABIT_TYPES], description: 'good, bad or neutral.' },
				description: text('The new description.'),
				scheduledDays: text('The new days, in the shape `all_habits` shows.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listHabits(ctx).find((h) => h.id === Number(args.id));
			if (!current) throw new NotFoundError('habit');
			updateHabit(ctx, current.id, {
				name: args.name ?? current.name,
				type: args.type ?? current.type,
				description: args.description ?? current.description,
				scheduledDays: args.scheduledDays ?? current.scheduledDays
			});
			return { ok: true };
		}
	},

	// ── Reminders ────────────────────────────────────────────────────────────
	{
		name: 'reminders',
		title: 'What will reach out, and when',
		description:
			'Everything set to go off, soonest first: reminders on blocks, alarms about nothing in particular, birthdays, bills that want paying, and a weekly review left open. `subjectKind` says which. Include the past to see what already fired.',
		scope: 'schedule:read',
		writes: false,
		input: object({ includePast: { type: 'boolean', default: false } }),
		run: (ctx, args) => listReminders(ctx, { includePast: Boolean(args.includePast) })
	},
	{
		/*
		 * The alarm clock, which this surface did not have.
		 *
		 * The old rule was that a reminder must hang off a block: "remind me at
		 * three to call the dentist" is a thing happening at three, so put it on
		 * the day and hang the nudge on it. That is good advice and it was a bad
		 * rule — "take the bread out in forty minutes" is not an appointment, and
		 * making somebody schedule a block to get a timer is the app telling
		 * them how to think. The app has these now; so does this.
		 */
		name: 'set_alarm',
		title: 'Set a reminder about nothing else',
		description:
			'A time and a sentence, reaching the phone even with the app closed — "take the bread out at ten past", "ring mum at six". Use this when there is nothing to schedule; when the reminder is *about* something already on the day, `remind_before_block` hangs it on that block instead, which keeps the two together. `cancel_alarm` takes it back.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				at: text(
					'When, as YYYY-MM-DDTHH:MM in the person\u2019s own timezone. Seconds allowed and honoured. A bare YYYY-MM-DD means the hour their day starts. It has to be ahead of now — check the year, which is the one people leave out.'
				),
				message: text('What it should say, in their words.'),
				sound: {
					type: 'boolean',
					description:
						'Whether it should make a noise as well as showing. Silent unless asked; do not turn this on unless they said so.'
				}
			},
			['at', 'message']
		),
		run: (ctx, args) => ({
			id: createFreeReminder(ctx, {
				at: args.at,
				message: args.message,
				audible: args.sound === true
			})
		})
	},
	{
		/*
		 * The middle of the verb set, which was missing.
		 *
		 * A reminder could be made and unmade and nothing in between, so "make
		 * that one half an hour later" meant cancelling it and setting another
		 * — a different id, a lost dismissal, and a round trip for something
		 * that is one field.
		 */
		name: 'change_reminder',
		title: 'Change a reminder that is already set',
		description:
			'Move a reminder, reword it, or change whether it makes a noise — the one `set_alarm` made, or a nudge before a block. Send only what changes; anything left out stays as it is. Takes the id `reminders` gives.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'reminder' }],
		input: object(
			{
				id: { type: 'integer', description: 'The reminder\u2019s id.' },
				at: text(
					'A new time, as YYYY-MM-DDTHH:MM in the person\u2019s own timezone. A bare YYYY-MM-DD means the hour their day starts. It has to be ahead of now.'
				),
				message: text('What it should say instead, in their words.'),
				sound: {
					type: 'boolean',
					description:
						'Whether it should make a noise. Leave it out to keep what it does now; do not turn this on unless they said so.'
				}
			},
			['id']
		),
		run: (ctx, args) => ({
			ok: editReminder(ctx, Number(args.id), {
				at: args.at,
				message: args.message,
				audible: args.sound
			})
		})
	},
	{
		name: 'cancel_alarm',
		title: 'Take a reminder back',
		description:
			'Remove a reminder outright — the one `set_alarm` made, or any other. `dismiss_reminder` waves one off and leaves the row; this deletes it. Takes the id `reminders` gives.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'reminder' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The reminder\u2019s id.' } }, ['id']),
		run: (ctx, args) => ({ ok: deleteReminder(ctx, Number(args.id)) })
	},
	{
		name: 'remind_before_block',
		title: 'Set a reminder on a block',
		description:
			'Be told some minutes before a block starts — it reaches the phone even with the app closed. A reminder belongs to a block: for "remind me at three to call the dentist", first `add_block` the call at three, then set the reminder on it. Takes the id the day gives, like `slot:42`.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'block' }],
		input: object(
			{
				id: text('The block\u2019s id, exactly as the day gave it.'),
				minutes: {
					type: 'integer',
					description: 'How many minutes before the start. 0 is at the start.'
				},
				message: text('What the nudge should say. The block\u2019s own name if left out.')
			},
			['id', 'minutes']
		),
		run: (ctx, args) => ({
			id: createReminder(
				ctx,
				{ subjectId: recordIdOf(ctx, args.id), at: args.minutes, message: args.message },
				// An assistant asking on somebody's behalf is somebody asking:
				// the same floor, and the same sentence back if it is too soon.
				{ chosen: true }
			)
		})
	},
	{
		name: 'dismiss_reminder',
		title: 'Dismiss a reminder',
		description:
			'Wave one reminder off so it does not fire — for "no need to remind me about that any more". Takes the id `reminders` gives; the block it sat on is untouched.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'reminder' }],
		input: object({ id: { type: 'integer', description: 'The reminder\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			dismissReminder(ctx, Number(args.id));
			return { ok: true };
		}
	},

	// ── The repeating week ───────────────────────────────────────────────────
	{
		name: 'repeating_week',
		title: 'The week as it repeats',
		description:
			'The blocks that make up every week — each with its weekday, time, length and category. Weekdays are numbered from Monday: 0 is Monday, 6 is Sunday. Not all of them are weekly: `repeats` says in words how often each one comes back, which can be every N weeks, every N days, or a day of the month. This is the template the days are generated from; `today` and `upcoming` show what it produced. Read it before changing Tuesdays rather than a Tuesday.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) =>
			listWeeklySlots(ctx).map((slot) => ({
				...slot,
				repeats: repeatsInWords(slot.recurrence, slot.weekday)
			}))
	},
	{
		name: 'add_repeating_block',
		title: 'Put a block on every week',
		description:
			'Add a block that comes back — "gym on Tuesdays at seven", "the bins every other Tuesday", "rent on the first". Weekly unless `repeats` says otherwise. This changes every week from now on; `add_block` is the one for a single day. Weekdays count from Monday: 0 is Monday, 6 is Sunday. A block can be a bare category rather than a named thing — leave the title out and it shows as the category itself, which is what "put work in those hours" means.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				weekday: {
					type: 'integer',
					description: '0 is Monday, 6 is Sunday — the week starts on Monday here.'
				},
				title: text(
					'What it is — shown on the block. Leave it out for a block that is just the category.'
				),
				start_time: text('When it starts, as HH:MM on a 24-hour clock.'),
				minutes: count('How long it runs, in minutes.', 60),
				category: text('Which part of life it belongs to, by name — `categories` lists them.'),
				remind_minutes: {
					type: 'integer',
					description: 'Minutes before each occurrence to be reminded. No reminder if left out.'
				},
				...repeatArgs,
				...ratingArgs
			},
			['weekday', 'start_time']
		),
		run: (ctx, args) => {
			const chosen = categoryByName(ctx, args.category);
			// Every-N counts from the next of the chosen weekday, so "every other
			// Tuesday" starts on a Tuesday rather than on whatever today is.
			const anchor = recFormatDate(nextWeekdayOnOrAfter(ctx.now, args.weekday));
			const id = createSlot(ctx, {
				weekday: args.weekday,
				startTime: args.start_time,
				durationMinutes: args.minutes ?? 60,
				mode: 'category',
				categoryId: chosen.id,
				label: args.title,
				remindLeadMinutes: args.remind_minutes,
				recurrence: recurrenceFromArgs(args, anchor),
				...(gaveARating(args) ? { ratings: ratingsOf(args) } : {})
			});
			return usedEnergy(args)
				? { id, category: chosen.name, warning: ENERGY_WARNING }
				: { id, category: chosen.name };
		}
	},
	{
		name: 'change_repeating_block',
		title: 'Change a repeating block',
		description:
			'Change every future occurrence of a repeating block: its weekday, time, length, how often it comes back, the text on it, its category or its reminder. This is "move gym to Wednesdays" or "make it every other week"; `change_block` is "move this Wednesday\u2019s gym". Only the fields given change. Takes the id `repeating_week` gives.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'repeatingBlock' }],
		input: object(
			{
				id: {
					type: 'integer',
					description: 'The repeating block\u2019s id, as `repeating_week` gives it.'
				},
				weekday: {
					type: 'integer',
					description: 'The new weekday. 0 is Monday, 6 is Sunday.'
				},
				start_time: text('The new start, as HH:MM.'),
				minutes: { type: 'integer', description: 'The new length, in minutes.' },
				title: text(
					'The text shown on the block. A block that names an activity stays that activity — this only changes what the block says, which is how "add stretching to the morning routine\u2019s text" is done.'
				),
				category: text('Refile it under this part of life, by name.'),
				remind_minutes: { type: 'integer', description: 'The new reminder lead. 0 turns it off.' },
				...repeatArgs
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listWeeklySlots(ctx).find((w) => w.id === Number(args.id));
			if (!current) throw new NotFoundError('block');

			const refiled =
				args.category !== undefined && args.category !== null && args.category !== ''
					? {
							mode: 'category',
							categoryId: categoryByName(ctx, args.category).id,
							activityId: null
						}
					: { mode: current.mode, categoryId: current.categoryId, activityId: current.activityId };

			updateSlot(ctx, current.id, {
				weekday: args.weekday ?? current.weekday,
				startTime: args.start_time ?? current.startTime,
				durationMinutes: args.minutes ?? current.durationMinutes,
				...refiled,
				label: args.title ?? current.label,
				remindLeadMinutes: args.remind_minutes ?? current.remindLeadMinutes,
				recurrence:
					recurrenceFromArgs(
						args,
						recFormatDate(nextWeekdayOnOrAfter(ctx.now, args.weekday ?? current.weekday))
					) ??
					current.recurrence ??
					undefined
			});
			return { ok: true };
		}
	},
	{
		name: 'remove_repeating_block',
		title: 'Take a block out of the week',
		description:
			'Remove a repeating block from every week to come. Its past occurrences and their record stay. For one day only, use `cancel_block` instead — this is the whole pattern.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'repeatingBlock' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The repeating block\u2019s id.' } }, [
			'id'
		]),
		run: (ctx, args) => {
			deleteSlots(ctx, [Number(args.id)]);
			return { ok: true };
		}
	},
	{
		name: 'categories',
		title: 'The parts of a life',
		description:
			'The categories blocks are filed under — the areas of this person\u2019s life, each with its colour. Read it before writing a block, so the name is real rather than guessed.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) => listCategories(ctx)
	},
	{
		name: 'activities',
		title: 'The named recurring things',
		description:
			'Activities are the named things inside categories — "piano", not just "music". A block can name one instead of a bare category. `add_activity` and `change_activity` write them.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) => listActivities(ctx)
	},
	{
		name: 'add_activity',
		title: 'Name a new recurring thing',
		description:
			'Add an activity — a named thing inside a category, like "piano" inside "music" — so blocks can name it instead of the bare category.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				name: text('What it is called.'),
				category: text('The category it belongs to, by name — `categories` lists them.'),
				description: text('A line about it, shown where it is edited.')
			},
			['name']
		),
		run: (ctx, args) => {
			const chosen = categoryByName(ctx, args.category);
			const id = createActivity(ctx, {
				name: args.name,
				categoryId: chosen.id,
				description: args.description
			});
			return { id, category: chosen.name };
		}
	},
	{
		/*
		 * The gap an assistant hit: asked to fold stretching into the morning
		 * routine, it could read the activity, rewrite every block that used
		 * it, and not change the one sentence describing what the routine is.
		 */
		name: 'change_activity',
		title: 'Rename an activity, or say what it is',
		description:
			'Change an activity: its name, the line describing it, or which category it belongs to. Takes the id `activities` gives. Only the fields you pass change. Blocks that name it follow the change; nothing on any day is moved.',
		scope: 'schedule:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'activity' }],
		input: object(
			{
				id: { type: 'integer', description: 'The activity\u2019s id, as `activities` gave it.' },
				name: text('A new name.'),
				description: text('A new line about it. Pass an empty string to clear it.'),
				category: text('Move it to this category, by name.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = (
				listActivities(ctx) as {
					id: number;
					name: string;
					categoryId: number;
					description: string | null;
				}[]
			).find((a) => a.id === Number(args.id));
			if (!current) throw new NotFoundError('activity');

			updateActivity(ctx, Number(args.id), {
				name: args.name ?? current.name,
				categoryId:
					args.category === undefined ? current.categoryId : categoryByName(ctx, args.category).id,
				description: args.description === undefined ? current.description : args.description
			});
			return { ok: true };
		}
	},

	// ── People ───────────────────────────────────────────────────────────────
	{
		name: 'people',
		title: 'The people in their life',
		description:
			'Everybody the person keeps a page for — name, relationship, birthday, contact details. These are other people\u2019s facts held in this account, which is why they sit behind their own permission.',
		scope: 'people:read',
		writes: false,
		input: object({}),
		run: (ctx) => listPeople(ctx)
	},
	{
		name: 'upcoming_birthdays',
		title: 'Whose birthday is coming',
		description:
			'Birthdays in the days ahead, soonest first — the answer to "whose birthday is coming up". Only people with a birthday written down appear.',
		scope: 'people:read',
		writes: false,
		input: object({ days: count('How many days ahead to look.', 30) }),
		run: (ctx, args) => {
			const horizon = Math.min(Math.max(Number(args.days ?? 30), 1), 366);
			const today = localDateOf(ctx.now, ctx.tz);
			const start = new Date(`${today}T12:00:00`);

			const coming: { id: number; name: string; birthday: string; date: string; inDays: number }[] =
				[];
			for (const person of listPeople(ctx)) {
				if (!person.birthday) continue;
				const monthDay = person.birthday.slice(-5); // both shapes end -MM-DD
				for (let ahead = 0; ahead <= horizon; ahead++) {
					const at = new Date(start.getTime() + ahead * 24 * 60 * 60 * 1000);
					const local = at.toISOString().slice(0, 10);
					if (local.slice(5) === monthDay) {
						coming.push({
							id: person.id,
							name: person.name,
							birthday: person.birthday,
							date: local,
							inDays: ahead
						});
						break;
					}
				}
			}
			return coming.sort((a, b) => a.inDays - b.inDays);
		}
	},
	{
		name: 'add_person',
		title: 'Add a person',
		description:
			'Keep a page for somebody — name at minimum; birthday as YYYY-MM-DD, or --MM-DD when the year is unknown. A birthday written down announces itself on the morning, unless told not to.',
		scope: 'people:write',
		writes: true,
		input: object(
			{
				name: text('Their name, as the person says it.'),
				relationship: {
					type: 'string',
					enum: [...RELATIONSHIPS],
					description: 'The nearest of these — "sister" is family, "landlord" is professional.'
				},
				birthday: text('YYYY-MM-DD, or --MM-DD without a year.'),
				remindOnBirthday: {
					type: 'boolean',
					description: 'Announce the birthday that morning. On if left out.'
				},
				phone: text('A phone number.'),
				email: text('An email address.'),
				notes: text('Anything else worth keeping.')
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createPerson(ctx, {
				name: args.name,
				relationship: args.relationship,
				birthday: args.birthday,
				remindOnBirthday: args.remindOnBirthday,
				phone: args.phone,
				email: args.email,
				notes: args.notes
			})
		})
	},
	{
		name: 'change_person',
		title: 'Change a person\u2019s page',
		description:
			'Correct or extend what is recorded about somebody — a birthday learnt, a number changed. Only the fields given change. Takes the id `people` gives.',
		scope: 'people:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'person' }],
		input: object(
			{
				id: { type: 'integer', description: 'The person\u2019s id.' },
				name: text('The new name.'),
				relationship: {
					type: 'string',
					enum: [...RELATIONSHIPS],
					description: 'The new relationship, one of these.'
				},
				birthday: text('YYYY-MM-DD, or --MM-DD without a year.'),
				remindOnBirthday: {
					type: 'boolean',
					description: 'Whether the birthday announces itself.'
				},
				phone: text('The new phone number.'),
				email: text('The new email address.'),
				notes: text('The new notes.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listPeople(ctx).find((one) => one.id === Number(args.id));
			if (!current) throw new NotFoundError('person');
			updatePerson(ctx, current.id, {
				name: args.name ?? current.name,
				relationship: args.relationship ?? current.relationship,
				birthday: args.birthday ?? current.birthday,
				remindOnBirthday: args.remindOnBirthday ?? current.remindOnBirthday,
				phone: args.phone ?? current.phone,
				email: args.email ?? current.email,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},

	// ── The day's wins, and the week's review ────────────────────────────────
	{
		name: 'daily_wins',
		title: 'Three things that went well',
		description:
			'The day\u2019s three wins, as written. A practice, not a log: three lines a day, and blank ones are simply not written yet.',
		scope: 'notes:read',
		writes: false,
		input: object({ date: text('The day, as YYYY-MM-DD. Today if left out.') }),
		run: (ctx, args) =>
			listWins(ctx, args.date ? day(args.date, 'date') : localDateOf(ctx.now, ctx.tz))
	},
	{
		name: 'record_win',
		title: 'Record a win',
		description:
			'Write one of the day\u2019s three good things, in the person\u2019s own words, into the first empty line. Refused when all three are written — a day holds three, and the fourth is tomorrow\u2019s first.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				content: text('The win, exactly as they said it.'),
				date: text('The day it belongs to, as YYYY-MM-DD. Today if left out.')
			},
			['content']
		),
		subject: winsOfDay,
		run: (ctx, args) => {
			const forDate = args.date ? day(args.date, 'date') : localDateOf(ctx.now, ctx.tz);
			const existing = listWins(ctx, forDate);
			const contents: string[] = [];
			for (let position = 1; position <= WINS_PER_DAY; position++) {
				contents.push(existing.find((w) => w.position === position)?.content ?? '');
			}
			const empty = contents.findIndex((c) => !c.trim());
			if (empty === -1)
				throw new ValidationError('All three wins are already written for that day.');
			contents[empty] = String(args.content ?? '');
			saveWins(ctx, { forDate, contents });
			return { ok: true, position: empty + 1 };
		}
	},
	{
		name: 'weekly_review',
		title: 'How a week actually went',
		description:
			'A week read whole: planned against done, by category, with the three lines written about it. The heart of the app — this is what the Monday mail says, and what closing a week means. Defaults to the week now running.',
		scope: 'tasks:read',
		writes: false,
		input: object({
			weekStart: text(
				'The day the week starts on, as YYYY-MM-DD \u2014 the account\u2019s own first day, Monday unless it says otherwise. Any day inside the week works; it snaps. This week if left out.'
			)
		}),
		run: (ctx, args) => {
			const weekStart = weekStartOf(ctx, args.weekStart);
			const { reading, loose } = readWeek(ctx, weekStart);
			return { weekStart, reading, loose, note: readNote(ctx, weekStart) };
		}
	},
	{
		name: 'write_review_note',
		title: 'Write the week\u2019s note',
		description:
			'Replace the note on a week\u2019s review — in the person\u2019s own words, and only when they said them. This is what they will reread in a year; never compose it unasked. It used to be three separate lines and is one piece of writing now, so a note somebody dictates in three sentences is stored as they said it.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				note: text('The whole note, replacing what was there. Empty removes it.'),
				weekStart: text(
					'The day the week starts on \u2014 the account\u2019s own first day. Any day inside the week works; it snaps. This week if left out.'
				)
			},
			['note']
		),
		subject: weekNote,
		run: (ctx, args) => {
			const weekStart = weekStartOf(ctx, args.weekStart);
			saveNote(ctx, { weekStart, content: args.note });
			return { ok: true, weekStart };
		}
	},

	// ── Data streams ─────────────────────────────────────────────────────────
	{
		name: 'data_streams',
		title: 'The numbers being tracked',
		description:
			'The account\u2019s data streams — weight, mood, sleep, anything a plugin or a person logs over time — each with its slug, kind and unit. `log_data_point` writes into one by its slug.',
		scope: 'streams:read',
		writes: false,
		input: object({}),
		run: (ctx) => listStreams(ctx).map((one) => serialiseStream(one))
	},
	{
		name: 'log_data_point',
		title: 'Log a reading',
		description:
			'Write one point into a data stream — "I weigh 82 today", "slept 6 hours". Takes the stream\u2019s slug as `data_streams` gives it; a slug that names nothing is refused with the list, never created on the quiet.',
		scope: 'streams:write',
		writes: true,
		input: object(
			{
				stream: text('The stream\u2019s slug, as `data_streams` gives it.'),
				value: { type: 'number', description: 'The reading.' },
				at: text('When it was taken, as an ISO instant. Now if left out.'),
				text: text('A word beside the number, if they said one.')
			},
			['stream', 'value']
		),
		run: (ctx, args) => {
			const slug = String(args.stream ?? '').trim();
			const stream = getStreamBySlug(ctx, slug, { throwIfMissing: false });
			if (!stream) {
				const known = listStreams(ctx).map((one) => one.slug);
				throw new ValidationError(
					known.length
						? `No stream called "${slug}". This account has: ${known.join(', ')}.`
						: 'This account has no data streams yet — declare one in the app or over the API first.'
				);
			}
			return pushPoints(ctx, slug, [
				{
					at: args.at ?? ctx.now.toISOString(),
					value: args.value,
					...(args.text !== undefined && args.text !== null ? { text: args.text } : {})
				}
			]);
		}
	},

	// ── Ideas, the other halves ──────────────────────────────────────────────
	{
		name: 'apply_idea',
		title: 'Mark an idea applied',
		description:
			'Say an idea was acted on, with a note about what came of it — or take that back by calling it again. Applied is not deleted: the idea stays, wearing what happened.',
		scope: 'ideas:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'idea' }],
		input: object(
			{
				id: { type: 'integer', description: 'The idea\u2019s id, as `ideas` gives it.' },
				note: text('What came of it, if they said.')
			},
			['id']
		),
		run: (ctx, args) => {
			toggleApplied(ctx, Number(args.id), args.note);
			return { ok: true };
		}
	},
	{
		name: 'favorite_idea',
		title: 'Star an idea',
		description:
			'Star an idea, or unstar it by calling this again. A star is the person\u2019s to ask for — never decorate their inbox on your own judgement.',
		scope: 'ideas:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'idea' }],
		input: object({ id: { type: 'integer', description: 'The idea\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			toggleFavorite(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		/*
		 * The question the whole tree exists to answer. Matches by name, and
		 * answers the way a person would: the chain of locations, root down.
		 */
		name: 'where_is',
		title: 'Where a thing lives',
		description:
			'Find a thing by name and say where it lives — "Living room \u203a White chest \u203a First drawer" — with its fields (a tape\u2019s length, a cable\u2019s plug). The inventory half of the shopping list.',
		scope: 'locations:read',
		writes: false,
		input: object({ name: text('The thing, by name or part of it.') }, ['name']),
		run: (ctx, args) => {
			/*
			 * A name, and only things that live somewhere.
			 *
			 * An empty name matched every row — `''.includes` is always true —
			 * and the rows include plain shopping-list lines, which have no
			 * address at all. So a token holding `locations:read` could read
			 * the shopping list ten names at a time, and the two grants are
			 * separate on purpose: "a widget that wanted the list does not get
			 * told where the spare keys are kept", and not the reverse either.
			 */
			const wanted = String(args.name ?? '')
				.trim()
				.toLowerCase();
			if (!wanted) throw new ValidationError('Say what to look for.');

			const hits = listInventoryItems(ctx)
				.filter((i) => i.locationId !== null && i.name.toLowerCase().includes(wanted))
				.slice(0, 10)
				.map((i) => ({
					id: i.id,
					name: i.name,
					location: i.locationId ? pathOf(ctx, i.locationId).join(' \u203a ') : null,
					attributes: JSON.parse(i.attributes || '{}')
				}));
			return { things: hits };
		}
	},
	{
		name: 'locations',
		title: 'The locations tree',
		description:
			'Every location, nested the way the house is — rooms holding furniture holding drawers — each with how many things sit directly in it.',
		scope: 'locations:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ locations: locationTree(ctx) })
	},
	{
		name: 'add_location',
		title: 'Add a location',
		description:
			'Add a location things can live in — a room, a chest, a drawer — optionally inside another location.',
		scope: 'locations:write',
		writes: true,
		input: object(
			{
				name: text('What the location is called.'),
				parent_id: { type: 'integer', description: 'The location it is inside, from `locations`.' }
			},
			['name']
		),
		run: (ctx, args) => ({ id: createLocation(ctx, { name: args.name, parentId: args.parent_id }) })
	},
	{
		name: 'change_location',
		title: 'Rename or move a location',
		description:
			'Rename a location, or move it under a different parent (no parent_id moves it to the top level). It refuses to be put inside itself.',
		scope: 'locations:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'location' }],
		input: object(
			{
				id: { type: 'integer', description: 'The location\u2019s id.' },
				name: text('The name, rewritten.'),
				parent_id: { type: 'integer', description: 'The new parent, or leave out for top level.' }
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getLocation(ctx, Number(args.id));
			updateLocation(ctx, current.id, {
				name: args.name ?? current.name,
				parentId: args.parent_id === undefined ? current.parentId : args.parent_id
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Removing a location is cheap on purpose: its children rise to where it
		 * was and the things in it merely lose their address — nothing a person
		 * typed is destroyed, so this verb may exist beside add_location.
		 */
		name: 'remove_location',
		title: 'Remove a location',
		description:
			'Remove a location. Locations inside it rise to where it was; things in it stay, just without an address.',
		scope: 'locations:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'location' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The location\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteLocation(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'put_item',
		title: 'Say where a thing lives',
		description:
			'Put a shopping/inventory item in a location, or take its address away by leaving location_id out. The item itself is untouched.',
		scope: 'locations:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id, as `shopping_list` gives it.' },
				location_id: {
					type: 'integer',
					description: 'The location, from `locations`. Leave out to unfile.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setItemLocation(
				ctx,
				Number(args.id),
				args.location_id === undefined ? null : Number(args.location_id)
			);
			return { ok: true };
		}
	},
	{
		name: 'set_item_attributes',
		title: 'Set a thing\u2019s attributes',
		description:
			'Replace an item\u2019s attributes wholesale — { "length": "5m", "plug": "USB-C" }. Not every thing shares a shape; these are this thing\u2019s. A name with an empty value is a whole attribute: "cable" says as much as "kind": "cable". Send the full set: removing one is writing the rest.',
		scope: 'inventory:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'item' }],
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id.' },
				attributes: {
					type: 'object',
					description: 'The attributes, string values. An empty value is allowed.',
					additionalProperties: { type: 'string' }
				}
			},
			['id', 'attributes']
		),
		run: (ctx, args) => {
			setItemAttributes(ctx, Number(args.id), (args.attributes ?? {}) as Record<string, string>);
			return { ok: true };
		}
	},
	{
		name: 'workouts',
		title: 'Your workouts',
		description:
			'The workouts you have written down, under Health. Each has a category and a plan; put one on the week with add_block and its workoutId to have it planned like a meal.',
		scope: 'workouts:read',
		writes: false,
		input: object({
			include_archived: { type: 'boolean', description: 'Include ones put away.' }
		}),
		run: (ctx, args) => ({
			workouts: listWorkouts(ctx, { includeArchived: !!args.include_archived })
		})
	},
	{
		/*
		 * What a workout is for, as names without numbers.
		 *
		 * Nothing is recorded by declaring these: they decide what writing a
		 * session down asks for, which is why they belong to the workout rather
		 * than to any one session of it.
		 */
		name: 'set_workout_measures',
		title: 'Say what a workout measures',
		description:
			'Declare what a workout is measured by \u2014 a run by kilometres and a pace, a push day by what was benched and for how many reps. Names and units only; no amounts. Replaces the list it has, so send all of them. A session may still measure anything: this decides what its form opens on.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workout' }],
		input: object(
			{
				id: { type: 'integer', description: 'The workout, from `workouts`.' },
				measures: MEASURE_NAMES
			},
			['id', 'measures']
		),
		run: (ctx, args) => {
			setWorkoutMeasures(ctx, Number(args.id), args.measures);
			return { ok: true };
		}
	},
	{
		/*
		 * The register, which is the half `workouts` cannot answer.
		 *
		 * A workout says what somebody intends to do and when they last did it.
		 * A session says what they actually did and how much of it, which is the
		 * question behind "am I lifting more than in March".
		 */
		name: 'workout_sessions',
		title: 'What was actually done',
		description:
			'Sessions, newest first: the day, anything noted, and lines of activity, amount and unit in the person’s own words — ran 5 km, deadlifted 120 kg. Narrow it with `workout_id` or `since` rather than reading everything.',
		scope: 'workouts:read',
		writes: false,
		input: object({
			workout_id: { type: 'integer', description: 'Only this workout’s, from `workouts`.' },
			since: text('Only sessions on or after this day, as YYYY-MM-DD.'),
			limit: count('How many sessions.', 50),
			offset: from('the register')
		}),
		run: (ctx, args) => {
			const where = {
				workoutId: args.workout_id === undefined ? undefined : Number(args.workout_id),
				since: args.since === undefined ? undefined : day(args.since, 'since')
			};
			const offset = offsetOf(args);
			return pageOf(
				listSessions(ctx, { ...where, limit: limitOf(args, 50), offset }),
				countSessions(ctx, where),
				offset,
				'sessions'
			);
		}
	},
	{
		name: 'log_workout',
		title: 'Write down a session',
		description:
			'Record that a workout happened, and how much of what was done. Everything but the workout is optional: a session with no lines is one that happened. Use the person’s own words and units — "ran" and "km", not a normalised distance — because that is what a chart of it will be grouped by. `workout_sessions` shows what they have called things before.',
		scope: 'workouts:write',
		writes: true,
		input: object(
			{
				workout_id: { type: 'integer', description: 'Which workout, from `workouts`.' },
				done_on: text('The day, as YYYY-MM-DD. Today if left off.'),
				notes: text('Anything worth saying about it.'),
				measures: {
					type: 'array',
					description:
						'What was done, a line each. `amount` and `unit` may be left off for something that happened without a number attached.',
					items: {
						type: 'object',
						properties: {
							activity: { type: 'string', description: 'What was done: "ran", "deadlifted".' },
							amount: { type: 'number', description: 'How much.' },
							unit: { type: 'string', description: 'Of what: "km", "kg", "reps".' }
						},
						required: ['activity']
					}
				}
			},
			['workout_id']
		),
		run: (ctx, args) => ({
			id: logWorkout(ctx, Number(args.workout_id), {
				doneOn: args.done_on,
				notes: args.notes ?? '',
				measures: args.measures ?? []
			})
		})
	},
	{
		name: 'change_workout_session',
		title: 'Correct a session',
		description:
			'Rewrite a session that was written down wrong. The lines are replaced by the ones given, so send them all; leaving `measures` off keeps the ones it has.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workoutSession' }],
		input: object(
			{
				id: { type: 'integer', description: 'The session’s id, from `workout_sessions`.' },
				done_on: text('The day it actually happened, as YYYY-MM-DD.'),
				notes: text('What to say about it instead.'),
				measures: {
					type: 'array',
					description: 'The lines, replacing every one it has.',
					items: {
						type: 'object',
						properties: {
							activity: { type: 'string' },
							amount: { type: 'number' },
							unit: { type: 'string' }
						},
						required: ['activity']
					}
				}
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getSession(ctx, Number(args.id));
			updateSession(ctx, current.id, {
				doneOn: args.done_on ?? current.doneOn,
				notes: args.notes ?? current.notes,
				measures: args.measures
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Removable, unlike the things under `ai-never-deletes-precious-data`.
		 *
		 * A session written down twice, or against the wrong workout, is a
		 * mistake in a log rather than somebody's writing — and the way back
		 * from `log_workout` has to exist for the same reason every other verb
		 * here has its inverse.
		 */
		name: 'remove_workout_session',
		title: 'Remove a session',
		description:
			'Delete a session that was logged by accident. Its lines go with it; the workout itself stays. For correcting one rather than removing it, use `change_workout_session`.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workoutSession' }],
		destroys: true,
		input: object(
			{ id: { type: 'integer', description: 'The session’s id, from `workout_sessions`.' } },
			['id']
		),
		run: (ctx, args) => {
			deleteSession(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		/*
		 * One activity over time, in the shape a chart wants.
		 *
		 * Grouped by the person's own word rather than by workout, because "am I
		 * running more" is a question about running and not about which session
		 * it happened in.
		 */
		name: 'workout_history',
		title: 'One activity over time',
		description:
			'Every time one activity was measured, oldest first — the shape to draw or to compare against. `workout_activities` lists what this account has measured and how often, which is where the name comes from.',
		scope: 'workouts:read',
		writes: false,
		input: object(
			{
				activity: text('The activity, exactly as it was written down: "ran".'),
				since: text('Only from this day on, as YYYY-MM-DD.')
			},
			['activity']
		),
		run: (ctx, args) => ({
			points: measureHistory(ctx, String(args.activity), {
				since: args.since === undefined ? undefined : day(args.since, 'since')
			})
		})
	},
	{
		name: 'workout_activities',
		title: 'What this account measures',
		description:
			'Every activity and unit that has ever been written down, with how many times — the names `workout_history` takes, and the ones to reuse when logging so a chart groups them together.',
		scope: 'workouts:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ activities: measuredActivities(ctx) })
	},
	{
		name: 'workout_categories',
		title: 'The categories of workout this account keeps',
		description:
			'The categories a workout can be filed under — this account\u2019s own list, not a fixed one. `add_workout` and `change_workout` take a category_id from here.',
		scope: 'workouts:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ categories: listWorkoutCategories(ctx) })
	},
	{
		name: 'add_workout_category',
		title: 'Add a category of workout',
		description:
			'Add a category to this account\u2019s list — "Swimming", "Physio". Answering with one that already exists returns it rather than making a second.',
		scope: 'workouts:write',
		writes: true,
		input: object({ name: text('What the category is called.') }, ['name']),
		run: (ctx, args) => ({ id: createWorkoutCategory(ctx, args.name) })
	},
	{
		/*
		 * The way back from add_workout_kind. Cheap on purpose: the workouts
		 * filed under it keep existing and simply lose their kind, so nothing
		 * anybody wrote is destroyed by removing a word from a list.
		 */
		name: 'remove_workout_category',
		title: 'Remove a category of workout',
		description:
			'Take a category off the list. Workouts filed under it keep existing, without one.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workoutCategory' }],
		destroys: true,
		input: object({ id: { type: 'integer', description: 'From `workout_categories`.' } }, ['id']),
		run: (ctx, args) => {
			deleteWorkoutCategory(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'add_workout',
		title: 'Add a workout',
		description:
			'Write a workout down: a title, a category (one of the account\u2019s own, from `workout_categories`), a plan as Markdown, and roughly how long it takes. Scheduling it onto a day is a block with its workoutId, the way a meal is a block with a recipe.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				title: text('What the session is called.'),
				category_id: { type: 'integer', description: 'Its category, from `workout_categories`.' },
				plan: text('What to do, as Markdown.'),
				minutes: { type: 'integer', description: 'Roughly how long it takes.' },
				notes: text('Anything else.'),
				measures: MEASURE_NAMES,
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['title']
		),
		run: (ctx, args) => ({
			id: createWorkout(ctx, {
				title: args.title,
				categoryId: args.category_id,
				plan: args.plan ?? '',
				minutes: args.minutes ?? null,
				notes: args.notes ?? '',
				measures: args.measures,
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			})
		})
	},
	{
		name: 'change_workout',
		title: 'Change a workout',
		description:
			'Rewrite a workout. Only the fields given change — for a misheard word or a better plan, not to turn it into a different session.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workout' }],
		input: object(
			{
				id: { type: 'integer', description: 'The workout\u2019s id, as `workouts` gives it.' },
				title: text('The title, rewritten.'),
				category_id: { type: 'integer', description: 'Its category, from `workout_categories`.' },
				plan: text('The plan, rewritten.'),
				minutes: { type: 'integer', description: 'Roughly how long it takes.' },
				notes: text('Notes, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getWorkout(ctx, Number(args.id));
			updateWorkout(ctx, current.id, {
				title: args.title ?? current.title,
				categoryId: args.category_id ?? current.categoryId,
				plan: args.plan ?? current.plan,
				minutes: args.minutes ?? current.minutes,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Put away, not deleted: a workout accumulates a history (when it was\n		 * last done, the blocks that pointed at it), so the reversible verb is\n		 * archive, and its inverse is the same tool with archived:false. There is\n		 * deliberately no delete_workout — a mistaken one is archived; a real\n		 * removal the person does in the app.\n		 */
		name: 'archive_workout',
		title: 'Put a workout away, or bring it back',
		description:
			'Take a workout out of the working list, or restore it. Nothing is lost either way — its history stays.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workout' }],
		input: object(
			{
				id: { type: 'integer', description: 'The workout\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'true to put away, false to bring back. Defaults to true.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setWorkoutArchived(
				ctx,
				Number(args.id),
				args.archived === undefined ? true : !!args.archived
			);
			return { ok: true };
		}
	},
	{
		name: 'workout_done',
		title: 'Mark a workout done',
		description:
			'Record that a workout happened just now — the gym\u2019s version of marking a recipe cooked. It stamps the last-done time.',
		scope: 'workouts:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'workout' }],
		input: object({ id: { type: 'integer', description: 'The workout\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			workoutDone(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'ledgers',
		title: 'Your ledgers',
		description:
			'The places money moves through — a current account, a credit card — with how many lines each holds and what they add up to. Amounts are in minor units (cents).',
		scope: 'statements:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ ledgers: listLedgers(ctx, { includeArchived: true }) })
	},
	{
		name: 'add_ledger',
		title: 'Add a ledger',
		description:
			'A new place money moves through. `kind` is bank, card, cash or other; `default_parser` preselects an export format when importing into it.',
		scope: 'statements:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				name: text('What it is called — "Nubank", "Visa".'),
				kind: text('bank, card, cash or other.'),
				default_parser: text("An export key like 'nubank:conta_corrente'."),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createLedger(ctx, {
				name: args.name,
				kind: args.kind ?? 'bank',
				defaultParser: args.default_parser,
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			}).id
		})
	},
	{
		name: 'record_movement',
		title: 'Put a line in a ledger',
		description:
			'One movement, for a plugin that reads a bank the parsers do not, or for a purchase the statement has not published yet. Amounts are signed minor units: negative left the account. Give `external_id` and re-sending the same movement adds nothing.',
		scope: 'statements:write',
		writes: true,
		input: object(
			{
				ledger_id: { type: 'integer', description: 'Which ledger, as `ledgers` gives it.' },
				occurred_on: text('The day it moved, YYYY-MM-DD.'),
				amount_cents: {
					type: 'integer',
					description: 'Signed minor units — negative when money left.'
				},
				description: text('What the bank would call it. The sorting rules read this.'),
				external_id: text("The source's own id for it, if it has one.")
			},
			['ledger_id', 'occurred_on', 'amount_cents', 'description']
		),
		run: (ctx, args) =>
			recordMovement(ctx, {
				ledgerId: args.ledger_id,
				occurredOn: args.occurred_on,
				amountCents: args.amount_cents,
				description: args.description,
				source: 'plugin',
				externalId: args.external_id
			})
	},
	{
		name: 'statement_months',
		title: 'Money in and out, by month',
		description:
			'What arrived and what left, month by month, across every ledger or one of them. Amounts are in minor units (cents), and `out` is written positive.',
		scope: 'statements:read',
		writes: false,
		input: object({
			months: { type: 'integer', description: 'How many months back. 12 by default.' },
			ledger_id: { type: 'integer', description: 'Only this ledger.' }
		}),
		run: (ctx, args) => ({
			months: monthlyTotals(ctx, Number(args.months ?? 12), {
				ledgerId: args.ledger_id ? Number(args.ledger_id) : undefined
			})
		})
	},
	{
		name: 'spending_by_category',
		title: 'Where the money went',
		description:
			'Spending split by category over a window. Every outgoing line is in exactly one slice — uncategorized included — so the slices are the whole of what was spent.',
		scope: 'statements:read',
		writes: false,
		input: object({
			month: text("Only this month, as 'YYYY-MM'."),
			ledger_id: { type: 'integer', description: 'Only this ledger.' }
		}),
		run: (ctx, args) => ({
			categories: categorySlices(ctx, {
				month: typeof args.month === 'string' && args.month ? args.month : undefined,
				ledgerId: args.ledger_id ? Number(args.ledger_id) : undefined
			})
		})
	},
	{
		name: 'change_sort_rule',
		title: 'Change a sorting rule',
		description:
			'Rewrite a rule\u2019s name, pattern or colour. Only the fields given change, and the change re-sorts every line at once, past ones included.',
		scope: 'statements:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'sortRule' }],
		input: object(
			{
				id: { type: 'integer', description: 'The rule, as `sort_rules` lists it.' },
				name: text('The name, rewritten.'),
				pattern: text('A JavaScript regular expression, matched case-insensitively.'),
				color: text('A hex colour like #1d4ed8.')
			},
			['id']
		),
		run: (ctx, args) => ({
			rule: updateRule(ctx, Number(args.id), {
				name: args.name,
				pattern: args.pattern,
				color: args.color
			})
		})
	},
	{
		name: 'movements',
		title: 'Bank-statement lines',
		description:
			'Imported statement lines, newest first, each with the category (at most one — they partition) and tags (any number) your sorting rules give it. Amounts in minor units, negative when money left.',
		scope: 'statements:read',
		writes: false,
		input: object({
			month: text("Only this month, as 'YYYY-MM'. Everything if left out."),
			ledger_id: { type: 'integer', description: 'Only this ledger.' }
		}),
		run: (ctx, args) => ({
			movements: listMovements(ctx, {
				month: typeof args.month === 'string' && args.month ? args.month : undefined,
				ledgerId: args.ledger_id ? Number(args.ledger_id) : undefined,
				limit: 500
			})
		})
	},
	{
		name: 'add_sort_rule',
		title: 'Add a sorting rule',
		description:
			'A regular expression that sorts statement lines, applied at read time — past lines included. Categories partition (first match, in position order, wins); tags overlap freely.',
		scope: 'statements:write',
		writes: true,
		input: object(
			{
				kind: text("'category' or 'tag'."),
				name: text('What the category or tag is called.'),
				pattern: text('A JavaScript regular expression, matched case-insensitively.')
			},
			['kind', 'name', 'pattern']
		),
		run: (ctx, args) => ({
			id: createRule(ctx, { kind: args.kind, name: args.name, pattern: args.pattern }).id
		})
	},
	{
		name: 'delete_sort_rule',
		title: 'Delete a sorting rule',
		description: 'The rule goes; the lines it sorted stay, now sorted by the rules that remain.',
		scope: 'statements:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'sortRule' }],
		/*
		 * It is a delete, so it needs the grant that says so.
		 *
		 * `destroys` is what `assertAllowed` demands `destructive` for, and the
		 * sentence somebody grants reads "with only the write grants, it can
		 * add and change but never remove". Without this flag the default
		 * assistant token — which deliberately holds no `destructive` — could
		 * wipe every sorting rule, and with them the categorisation of a whole
		 * statement history.
		 */
		destroys: true,
		input: object({ id: { type: 'integer', description: 'The rule, as listed by sort_rules.' } }, [
			'id'
		]),
		run: (ctx, args) => {
			deleteRule(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'sort_rules',
		title: 'The sorting rules',
		description:
			'Every sorting rule — categories and tags, with their regular expressions — in the order categories win.',
		scope: 'statements:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ rules: listRules(ctx) })
	},
	{
		name: 'bills',
		title: 'Your bills',
		description:
			'The bills you expect to pay, and what you have actually paid. Amounts are in minor units (cents): 12000 is R$120,00. Marking one paid records the real amount, which can differ from the expected one.',
		scope: 'bills:read',
		writes: false,
		input: object({
			include_archived: { type: 'boolean', description: 'Include ones put away.' },
			flow: text(
				"Which direction: 'out' (bills, the default) or 'in' — income, recorded exactly the way bills are."
			)
		}),
		run: (ctx, args) => ({
			bills: listBills(ctx, {
				includeArchived: !!args.include_archived,
				flow: args.flow === 'in' ? 'in' : 'out'
			})
		})
	},
	{
		name: 'bill_payments',
		title: 'What a bill has cost',
		description:
			'Every period a bill has been paid for, with the expected amount and what was actually paid. Amounts in minor units (cents).',
		scope: 'bills:read',
		writes: false,
		refs: [{ arg: 'id', kind: 'bill' }],
		input: object({ id: { type: 'integer', description: 'The bill\u2019s id.' } }, ['id']),
		run: (ctx, args) => ({ payments: listPayments(ctx, Number(args.id)) })
	},
	{
		name: 'month_bills',
		title: 'A month of bills at a glance',
		description:
			'For a month (YYYY-MM), what the monthly bills expected, what has been paid, and the gap. Amounts in minor units (cents).',
		scope: 'bills:read',
		writes: false,
		input: object({ month: text('The month as YYYY-MM. This month if left out.') }),
		run: (ctx, args) => {
			const month =
				typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month)
					? args.month
					: `${ctx.now.getUTCFullYear()}-${String(ctx.now.getUTCMonth() + 1).padStart(2, '0')}`;
			return { month, ...monthSummary(ctx, month) };
		}
	},
	{
		name: 'bills_due',
		title: 'Bills that want paying',
		description:
			'The bills falling due between two dates, each on the day it wants paying (the due day less its lead), with whether that one is already paid. This is what the week shows.',
		scope: 'bills:read',
		writes: false,
		input: object(
			{
				from: text('First day, as 2026-03-14.'),
				to: text('Last day, as 2026-03-21.')
			},
			['from', 'to']
		),
		run: (ctx, args) => ({
			due: billsDueBetween(ctx, day(args.from, 'from'), day(args.to, 'to'))
		})
	},
	{
		name: 'add_bill',
		title: 'Add a bill',
		description:
			'Write down a bill you expect to pay: a name, the expected amount in minor units (cents), and a rhythm (weekly, monthly, yearly, once). A monthly bill can name the day of the month it falls due.',
		scope: 'bills:write',
		writes: true,
		refs: [{ arg: 'notebookId', kind: 'notebook' }],
		input: object(
			{
				name: text('What the bill is called.'),
				amount_expected: {
					type: 'integer',
					description: 'The expected amount, in minor units (cents).'
				},
				rhythm: text('weekly, monthly, yearly, or once.'),
				due_day: {
					type: 'integer',
					description:
						'Day of the month it falls due, 1-28 (monthly) — the last day it can be paid.'
				},
				pay_lead_days: {
					type: 'integer',
					description:
						'Pay it this many days before the due day (0 = on the day). It turns up on the week that day.'
				},
				currency: text('A currency code like BRL. The account\u2019s default if left out.'),
				flow: text("'out' for a bill (the default), 'in' for income."),
				notes: text('Anything else.'),
				notebookId: {
					type: 'integer',
					description:
						'The notebook this belongs to, as `notebooks` gives its id — a subject somebody is working through, like a renovation. Only when they said so, and only when that notebook’s `modules` list says it holds this.'
				}
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createBill(ctx, {
				name: args.name,
				amountExpected: args.amount_expected ?? 0,
				rhythm: args.rhythm,
				flow: args.flow === 'in' ? 'in' : 'out',
				dueDay: args.due_day,
				dueMonth: args.due_month,
				payLeadDays: args.pay_lead_days,
				currency: args.currency,
				notes: args.notes ?? '',
				...(args.notebookId === undefined ? {} : { notebookId: args.notebookId })
			}).id
		})
	},
	{
		name: 'change_bill',
		title: 'Change a bill',
		description:
			'Rewrite a bill. Only the fields given change. Editing the expected amount does not rewrite what past payments recorded — those are snapshots of the day they were paid.',
		scope: 'bills:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'bill' }],
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id, as `bills` gives it.' },
				name: text('The name, rewritten.'),
				amount_expected: {
					type: 'integer',
					description: 'The expected amount, in minor units (cents).'
				},
				rhythm: text('weekly, monthly, yearly, or once.'),
				due_day: {
					type: 'integer',
					description:
						'When it falls due. Monthly: day of the month. Weekly: weekday 1-7 from Monday. Yearly: day of due_month.'
				},
				due_month: { type: 'integer', description: 'For a yearly bill, the month, 1-12.' },
				pay_lead_days: {
					type: 'integer',
					description: 'Pay it this many days before the due day (0 = on the day).'
				},
				notes: text('Notes, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getBill(ctx, Number(args.id));
			updateBill(ctx, current.id, {
				name: args.name ?? current.name,
				amountExpected: args.amount_expected ?? current.amountExpected,
				rhythm: args.rhythm ?? current.rhythm,
				dueDay: args.due_day ?? current.dueDay,
				dueMonth: args.due_month ?? current.dueMonth,
				payLeadDays: args.pay_lead_days ?? current.payLeadDays,
				currency: current.currency,
				goalId: current.goalId,
				categoryId: current.categoryId,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Put away, not deleted: a bill carries payment history, so the reversible
		 * verb is archive and its inverse is the same tool with archived:false.
		 * No delete_bill — a mistaken one is archived; a real removal the person
		 * does in the app, where the history it takes with it is in front of them.
		 */
		name: 'archive_bill',
		title: 'Put a bill away, or bring it back',
		description:
			'Take a bill out of the active list (it stopped being paid), or restore it. Its payment history stays either way.',
		scope: 'bills:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'bill' }],
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'true to put away, false to bring back. Defaults to true.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setBillArchived(ctx, Number(args.id), args.archived === undefined ? true : !!args.archived);
			return { ok: true };
		}
	},
	{
		name: 'pay_bill',
		title: 'Mark a bill paid',
		description:
			'Record a bill paid for a period. The amount defaults to the expected one; give amount_paid in minor units (cents) when it differed. The period defaults to the current one for the bill\u2019s rhythm. Paying the same period again corrects it, never doubles it.',
		scope: 'bills:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'bill' }],
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				amount_paid: {
					type: 'integer',
					description: 'What was actually paid, in minor units (cents).'
				},
				period: text(
					'The period: YYYY-Www for weekly, YYYY-MM for monthly, YYYY for yearly. This period if left out.'
				),
				notes: text('Anything about this payment.')
			},
			['id']
		),
		subject: billWithPayments,
		run: (ctx, args) => ({
			payment: markPaid(ctx, Number(args.id), {
				amountPaid: args.amount_paid,
				period: args.period,
				notes: args.notes
			})
		})
	},
	{
		name: 'unpay_bill',
		title: 'Undo a bill payment',
		description:
			'Remove the payment recorded for a period — it was not actually paid, or was recorded by mistake. The inverse of pay_bill.',
		scope: 'bills:write',
		writes: true,
		refs: [{ arg: 'id', kind: 'bill' }],
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				period: text('The period to undo, e.g. 2026-09.')
			},
			['id', 'period']
		),
		subject: billWithPayments,
		run: (ctx, args) => {
			unmarkPaid(ctx, Number(args.id), String(args.period));
			return { ok: true };
		}
	}
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * Every room scope any tool needs — what a token for an assistant is asked to
 * hold. Deliberately without `destructive`: the preset everybody presses hands
 * over reading and writing, and the power to remove things for good is a
 * separate, quieter tick. Derived from the tools themselves, so a tool added
 * later is covered without anybody remembering.
 */
export const ASSISTANT_SCOPES = [...new Set(TOOLS.map((t) => t.scope))].sort();

/** The same set, for somebody who does want the assistant deleting things. */
export const ASSISTANT_SCOPES_DESTRUCTIVE: Scope[] = [...ASSISTANT_SCOPES, 'destructive'];
