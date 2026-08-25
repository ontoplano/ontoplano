import {
	integer,
	real,
	sqliteTable,
	text,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema.js';

export const categories = sqliteTable(
	'categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		color: text('color').notNull().default('#6b7280'),
		colorLight: text('color_light').notNull().default('#f3f4f6')
	},
	(table) => [
		index('categories_user_idx').on(table.userId),
		uniqueIndex('categories_user_name_unique').on(table.userId, table.name)
	]
);

export const activities = sqliteTable(
	'activities',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		categoryId: integer('category_id')
			.notNull()
			.references(() => categories.id),
		description: text('description').default(''),
		color: text('color').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('activities_user_idx').on(table.userId),
		index('activities_category_idx').on(table.categoryId),
		index('activities_active_idx').on(table.active)
	]
);

export const weeklySlots = sqliteTable(
	'weekly_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		weekday: integer('weekday').notNull(), // 0=Mon … 6=Sun
		// How often this actually repeats. 'weekly' is every week on `weekday`;
		// see $lib/recurrence.ts for the other shapes. Anything unrecognised reads
		// as weekly, so a bad value degrades rather than hiding the slot.
		recurrence: text('recurrence').notNull().default('weekly'),
		startTime: text('start_time').notNull(), // HH:MM
		durationMinutes: integer('duration_minutes').notNull().default(60),
		mode: text('mode', { enum: ['category', 'activity'] }).notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		activityId: integer('activity_id').references(() => activities.id),
		label: text('label').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		// How pressing, how appealing, how much it will take out of you, 1-5.
		// Nullable on purpose: forcing three numbers onto every task is how a
		// system stops being used by the second week. Columns rather than `meta`
		// JSON because the board sorts and filters on them.
		urgency: integer('urgency'),
		interest: integer('interest'),
		energy: integer('energy'),
		// User-defined key/value pairs, opaque to ontoplano and surfaced to
		// plugins via the schedule API — e.g. { "alarm": "true", "remind_min": "5" }.
		// Stored as a JSON object of string→string. See services/meta.ts.
		meta: text('meta').notNull().default('{}'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('slots_user_idx').on(table.userId),
		index('slots_weekday_idx').on(table.weekday),
		index('slots_weekday_time_idx').on(table.weekday, table.startTime),
		check('slots_urgency_range', sql`${table.urgency} IS NULL OR ${table.urgency} BETWEEN 1 AND 5`),
		check(
			'slots_interest_range',
			sql`${table.interest} IS NULL OR ${table.interest} BETWEEN 1 AND 5`
		),
		check('slots_energy_range', sql`${table.energy} IS NULL OR ${table.energy} BETWEEN 1 AND 5`),
		check('slots_weekday_range', sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`),
		check(
			'slots_mode_category',
			sql`${table.mode} != 'category' OR ${table.categoryId} IS NOT NULL`
		),
		check(
			'slots_mode_activity',
			sql`${table.mode} != 'activity' OR ${table.activityId} IS NOT NULL`
		)
	]
);

/**
 * One occurrence of a planned block on one date, with its own status.
 *
 * Exactly one of `slotId` / `exceptionalSlotId` is set: the first for an
 * occurrence of a recurring weekly slot, the second for a one-off. Before this
 * split, one-off blocks carried their own status columns and never produced an
 * instance, so every "what is on this date" question needed two queries and a
 * union — and the callers that forgot the second one were silently wrong.
 */
export const taskInstances = sqliteTable(
	'task_instances',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		slotId: integer('slot_id').references(() => weeklySlots.id),
		exceptionalSlotId: integer('exceptional_slot_id').references(() => exceptionalSlots.id, {
			onDelete: 'cascade'
		}),
		scheduledAt: text('scheduled_at').notNull(), // ISO 8601
		// What state the task is in. These are the kanban columns.
		status: text('status', { enum: ['todo', 'doing', 'done', 'skipped'] })
			.notNull()
			.default('todo'),
		// When it happened relative to plan. Set only once something is done —
		// `delayed` and `early` used to be statuses, but both mean *done*, which
		// is why there was nothing for a board column to map onto.
		timing: text('timing', { enum: ['early', 'on_time', 'late'] }),
		completedAt: text('completed_at'),
		notes: text('notes').default(''),
		resolvedActivityId: integer('resolved_activity_id').references(() => activities.id),
		durationOverride: integer('duration_override'),
		// What this one occurrence is, when it differs from what the block
		// usually is — "leg day" on a recurring gym block. Null means "whatever
		// the block says", the same as every other override here.
		labelOverride: text('label_override'),
		// Per-occurrence overrides of the block's ratings, exactly as
		// durationOverride overrides its length. Null means "inherit".
		urgencyOverride: integer('urgency_override'),
		interestOverride: integer('interest_override'),
		energyOverride: integer('energy_override'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('instances_user_idx').on(table.userId),
		index('instances_slot_idx').on(table.slotId),
		index('instances_exceptional_idx').on(table.exceptionalSlotId),
		index('instances_scheduled_idx').on(table.scheduledAt),
		index('instances_status_idx').on(table.status),
		index('instances_slot_scheduled_idx').on(table.slotId, table.scheduledAt),
		uniqueIndex('instances_exceptional_unique').on(table.exceptionalSlotId),
		check(
			'instance_has_exactly_one_source',
			sql`(${table.slotId} IS NULL) != (${table.exceptionalSlotId} IS NULL)`
		)
	]
);

// --- Diary ---

/**
 * A notebook is a subject you write against, with no deadline: a book you are
 * reading, a trip, a renovation.
 *
 * Deliberately not a goal — a goal is a commitment with a horizon and a verdict
 * at the end, and this has neither. It is a place to put things about one
 * subject, so it owns nothing: entries, todos and goals point at it, and
 * deleting one leaves all of them where they are.
 */
export const notebooks = sqliteTable(
	'notebooks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		title: text('title').notNull(),
		description: text('description').default(''),
		// Closed rather than deleted: a finished trip should stop cluttering the
		// list without taking its entries' context with it.
		closedAt: text('closed_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('notebooks_user_idx').on(table.userId),
		uniqueIndex('notebooks_user_title_unique').on(table.userId, table.title)
	]
);

/**
 * People you know, and the entries that mention them.
 *
 * A person is a subject you accumulate a history about, which is what makes
 * them different from a tag: "everything I wrote that mentions Ana" is a page,
 * not a filter that happens to work.
 *
 * `entry_people` carries its own `user_id` (I1) so a mutation can be scoped in
 * its own WHERE rather than through a join.
 */
export const people = sqliteTable(
	'people',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		relationship: text('relationship', {
			enum: ['family', 'friend', 'partner', 'professional', 'other']
		})
			.notNull()
			.default('other'),
		notes: text('notes').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('people_user_idx').on(table.userId),
		uniqueIndex('people_user_name_unique').on(table.userId, table.name)
	]
);

export const entryPeople = sqliteTable(
	'entry_people',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		entryId: integer('entry_id')
			.notNull()
			.references(() => diaryEntries.id, { onDelete: 'cascade' }),
		personId: integer('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('entry_people_user_idx').on(table.userId),
		index('entry_people_entry_idx').on(table.entryId),
		index('entry_people_person_idx').on(table.personId),
		uniqueIndex('entry_people_unique').on(table.entryId, table.personId)
	]
);

export const diaryEntries = sqliteTable(
	'diary_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		seq: integer('seq').notNull().default(0),
		content: text('content').notNull(),
		forDate: text('for_date'),
		notebookId: integer('notebook_id').references(() => notebooks.id, { onDelete: 'set null' }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('diary_entries_user_idx').on(table.userId),
		index('diary_entries_created_idx').on(table.createdAt),
		index('diary_entries_for_date_idx').on(table.forDate),
		index('diary_entries_notebook_idx').on(table.notebookId),
		uniqueIndex('diary_entries_user_seq_unique').on(table.userId, table.seq)
	]
);

export const tags = sqliteTable(
	'tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull()
	},
	(table) => [
		index('tags_user_idx').on(table.userId),
		uniqueIndex('tags_user_name_unique').on(table.userId, table.name)
	]
);

export const diaryEntryTags = sqliteTable(
	'diary_entry_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		entryId: integer('entry_id')
			.notNull()
			.references(() => diaryEntries.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('diary_entry_tags_user_idx').on(table.userId),
		index('diary_entry_tags_entry_idx').on(table.entryId),
		index('diary_entry_tags_tag_idx').on(table.tagId)
	]
);

// --- Habits ---

export const habits = sqliteTable(
	'habits',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		description: text('description').default(''),
		type: text('type', { enum: ['bad', 'good', 'neutral'] })
			.notNull()
			.default('bad'),
		scheduledDays: text('scheduled_days').default(''), // comma-separated weekday numbers (0=Mon..6=Sun), empty = every day
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('habits_user_idx').on(table.userId)]
);

export const habitOccurrences = sqliteTable(
	'habit_occurrences',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		habitId: integer('habit_id')
			.notNull()
			.references(() => habits.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // YYYY-MM-DD
		notes: text('notes').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('habit_occurrences_user_idx').on(table.userId),
		index('habit_occurrences_habit_idx').on(table.habitId),
		index('habit_occurrences_date_idx').on(table.date)
	]
);

// --- Planner: Suppressions, Exceptional Slots, Todos ---

export const suppressedSlots = sqliteTable(
	'suppressed_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		date: text('date').notNull(), // YYYY-MM-DD
		slotId: integer('slot_id')
			.notNull()
			.references(() => weeklySlots.id, { onDelete: 'cascade' }),
		/**
		 * Set when this day was *moved* rather than skipped.
		 *
		 * A skip means "not happening today", and the grid keeps showing it
		 * greyed so it can be put back. A move means "happening, but there
		 * instead" — the replacement is what should be on screen, and leaving
		 * the original visible makes one block look like two.
		 */
		movedToId: integer('moved_to_id').references(() => exceptionalSlots.id, {
			onDelete: 'set null'
		})
	},
	(table) => [
		index('suppressed_slots_user_date_idx').on(table.userId, table.date),
		uniqueIndex('suppressed_slots_unique').on(table.userId, table.date, table.slotId)
	]
);

export const exceptionalSlots = sqliteTable(
	'exceptional_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		date: text('date').notNull(), // YYYY-MM-DD
		startTime: text('start_time').notNull(), // HH:MM
		durationMinutes: integer('duration_minutes').notNull().default(60),
		mode: text('mode', { enum: ['category', 'activity'] }).notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		activityId: integer('activity_id').references(() => activities.id),
		label: text('label').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		// Carried over when a todo is dragged onto the grid, so scheduling
		// something does not remove it from the subject it belongs to.
		notebookId: integer('notebook_id').references(() => notebooks.id, { onDelete: 'set null' }),
		// How pressing, how appealing, how much it will take out of you. Nullable
		// on purpose: forcing three numbers onto every task is how a system stops
		// being used by the second week. Columns rather than `meta` JSON because
		// the board sorts and filters on them.
		urgency: integer('urgency'),
		interest: integer('interest'),
		energy: integer('energy'),
		meta: text('meta').notNull().default('{}'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('exceptional_slots_user_date_idx').on(table.userId, table.date),
		index('exceptional_slots_notebook_idx').on(table.notebookId),
		check(
			'exceptional_urgency_range',
			sql`${table.urgency} IS NULL OR ${table.urgency} BETWEEN 1 AND 5`
		),
		check(
			'exceptional_interest_range',
			sql`${table.interest} IS NULL OR ${table.interest} BETWEEN 1 AND 5`
		),
		check(
			'exceptional_energy_range',
			sql`${table.energy} IS NULL OR ${table.energy} BETWEEN 1 AND 5`
		),
		check(
			'exceptional_mode_category',
			sql`${table.mode} != 'category' OR ${table.categoryId} IS NOT NULL`
		),
		check(
			'exceptional_mode_activity',
			sql`${table.mode} != 'activity' OR ${table.activityId} IS NOT NULL`
		)
	]
);

export const plannerTodos = sqliteTable(
	'planner_todos',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		title: text('title').notNull(),
		notes: text('notes').default(''),
		completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
		categoryId: integer('category_id').references(() => categories.id),
		notebookId: integer('notebook_id').references(() => notebooks.id, { onDelete: 'set null' }),
		// A todo is a task without a date yet. Setting this is what "drag it onto
		// today" does — the same row acquires a day rather than being copied.
		scheduledDate: text('scheduled_date'),
		status: text('status', { enum: ['todo', 'doing', 'done', 'skipped'] })
			.notNull()
			.default('todo'),
		sortOrder: integer('sort_order').notNull().default(0),
		// How pressing, how appealing, how much it will take out of you, 1-5.
		// Nullable on purpose: forcing three numbers onto every task is how a
		// system stops being used by the second week. Columns rather than `meta`
		// JSON because the board sorts and filters on them.
		urgency: integer('urgency'),
		interest: integer('interest'),
		energy: integer('energy'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('planner_todos_user_idx').on(table.userId),
		index('planner_todos_scheduled_idx').on(table.userId, table.scheduledDate),
		index('planner_todos_notebook_idx').on(table.notebookId),
		check('todos_urgency_range', sql`${table.urgency} IS NULL OR ${table.urgency} BETWEEN 1 AND 5`),
		check(
			'todos_interest_range',
			sql`${table.interest} IS NULL OR ${table.interest} BETWEEN 1 AND 5`
		),
		check('todos_energy_range', sql`${table.energy} IS NULL OR ${table.energy} BETWEEN 1 AND 5`)
	]
);

// --- Shopping List ---

export const shoppingCategories = sqliteTable(
	'shopping_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('shopping_categories_user_idx').on(table.userId),
		uniqueIndex('shopping_categories_user_name_unique').on(table.userId, table.name)
	]
);

export const shoppingItems = sqliteTable(
	'shopping_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		type: text('type', { enum: ['someday', 'replenish'] }).notNull(),
		shoppingCategoryId: integer('shopping_category_id').references(() => shoppingCategories.id),
		notes: text('notes').default(''),
		bought: integer('bought', { mode: 'boolean' }).notNull().default(false),
		boughtAt: text('bought_at'),
		snoozed: integer('snoozed', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('shopping_items_user_idx').on(table.userId),
		index('shopping_items_type_idx').on(table.type),
		index('shopping_items_bought_idx').on(table.bought),
		index('shopping_items_snoozed_idx').on(table.snoozed),
		index('shopping_items_category_idx').on(table.shoppingCategoryId)
	]
);

// --- Planning Schemes ---

export const planningSchemes = sqliteTable(
	'planning_schemes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('schemes_user_idx').on(table.userId),
		uniqueIndex('schemes_user_name_unique').on(table.userId, table.name)
	]
);

export const schemeSlots = sqliteTable(
	'scheme_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		schemeId: integer('scheme_id')
			.notNull()
			.references(() => planningSchemes.id, { onDelete: 'cascade' }),
		weekday: integer('weekday').notNull(),
		startTime: text('start_time').notNull(),
		durationMinutes: integer('duration_minutes').notNull().default(60),
		mode: text('mode', { enum: ['category', 'activity'] }).notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		activityId: integer('activity_id').references(() => activities.id),
		label: text('label').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true)
	},
	(table) => [
		index('scheme_slots_user_idx').on(table.userId),
		index('scheme_slots_scheme_idx').on(table.schemeId)
	]
);

export const userSettings = sqliteTable(
	'user_settings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		key: text('key').notNull(),
		value: text('value').notNull()
	},
	(table) => [
		uniqueIndex('user_settings_user_key_unique').on(table.userId, table.key),
		index('user_settings_user_idx').on(table.userId)
	]
);

// --- Ideas ---

export const ideas = sqliteTable(
	'ideas',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		content: text('content').notNull(),
		isApplied: integer('is_applied', { mode: 'boolean' }).notNull().default(false),
		appliedNote: text('applied_note'),
		favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('ideas_user_idx').on(table.userId),
		index('ideas_created_idx').on(table.createdAt)
	]
);

export const ideaTags = sqliteTable(
	'idea_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		ideaId: integer('idea_id')
			.notNull()
			.references(() => ideas.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('idea_tags_user_idx').on(table.userId),
		index('idea_tags_idea_idx').on(table.ideaId),
		index('idea_tags_tag_idx').on(table.tagId)
	]
);

// --- Billing ---

/**
 * What an account is entitled to, and why.
 *
 * One row per account, created when the trial starts. The provider's columns
 * are null on a self-hosted instance and on a trial, because neither involves
 * one; `provider_subscription_id` is what a webhook matches on.
 *
 * The row is the record of a commercial relationship rather than the account's
 * own data, but it is scoped by `user_id` like everything else and goes when
 * the account does — the provider keeps its own copy, which is the one a
 * dispute is settled with.
 */
export const subscriptions = sqliteTable(
	'subscriptions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		plan: text('plan', { enum: ['free', 'pro'] })
			.notNull()
			.default('free'),
		status: text('status', {
			enum: ['trialing', 'active', 'past_due', 'canceled', 'expired']
		})
			.notNull()
			.default('trialing'),
		provider: text('provider').notNull().default('none'),
		providerCustomerId: text('provider_customer_id'),
		providerSubscriptionId: text('provider_subscription_id'),
		/** When the current paid period ends, or when the trial does. */
		currentPeriodEnd: text('current_period_end'),
		trialEndsAt: text('trial_ends_at'),
		/** Set when a cancellation is scheduled but the period is still running. */
		cancelAt: text('cancel_at'),
		/** Where the provider lets this customer manage their own card. */
		portalUrl: text('portal_url'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		uniqueIndex('subscriptions_user_unique').on(table.userId),
		index('subscriptions_provider_idx').on(table.providerSubscriptionId)
	]
);

/**
 * Every webhook the provider has sent, by its own id.
 *
 * Providers retry, and a retried "subscription cancelled" applied twice is
 * harmless while a retried "payment succeeded" is not. Storing the id is what
 * makes handling one exactly once possible.
 */
export const billingEvents = sqliteTable(
	'billing_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		provider: text('provider').notNull(),
		eventId: text('event_id').notNull(),
		eventType: text('event_type').notNull(),
		payload: text('payload').notNull(),
		/** Null until it has been applied; set when it has. */
		processedAt: text('processed_at'),
		error: text('error'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [uniqueIndex('billing_events_unique').on(table.provider, table.eventId)]
);

// --- Account history ---

/**
 * What happened to an account, and who did it.
 *
 * The events worth being able to answer for later: signing in, changing a
 * credential, changing a plan, exporting, being impersonated by an admin. The
 * subject is `user_id`; `actor_id` is who acted, which is the same person
 * unless an administrator did it on their behalf.
 *
 * It is the account's data and goes when the account does. A billing dispute
 * outlives that in the payment provider's own records, which is where a charge
 * is evidenced anyway.
 */
export const auditEvents = sqliteTable(
	'audit_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		/** Null when the account acted for itself. */
		actorId: text('actor_id'),
		event: text('event').notNull(),
		/** A JSON object of whatever the event needs to be legible later. */
		detail: text('detail').notNull().default('{}'),
		ip: text('ip'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('audit_events_user_idx').on(table.userId),
		index('audit_events_created_idx').on(table.createdAt)
	]
);

// --- Instance: invitations ---

/**
 * An invitation to create an account here.
 *
 * Instance data, not account data: it belongs to whoever runs the server, and
 * it outlives the account that issued it. That is why `created_by` and
 * `used_by` are plain ids with no foreign key — an invite must not stop an
 * account from being deleted, and a used invite is a record of what happened
 * rather than a link to somebody.
 */
export const invites = sqliteTable(
	'invites',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		code: text('code').notNull(),
		note: text('note').default(''),
		createdBy: text('created_by').notNull(),
		expiresAt: text('expires_at'),
		usedAt: text('used_at'),
		usedBy: text('used_by'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [uniqueIndex('invites_code_unique').on(table.code)]
);

// --- Plugin platform: API tokens ---
//
// Tokens are how external apps (a-private-plugin, scripts, future plugins) talk to
// ontoplano. Only the SHA-256 hash is stored — the plaintext is shown once at
// creation and is unrecoverable afterwards. `scopes` is a comma-separated list
// of scope slugs; see `$lib/server/services/tokens.ts` for the vocabulary.

export const apiTokens = sqliteTable(
	'api_tokens',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		prefix: text('prefix').notNull(), // first chars, shown in the UI to identify a token
		scopes: text('scopes').notNull().default(''),
		lastUsedAt: text('last_used_at'),
		expiresAt: text('expires_at'),
		revokedAt: text('revoked_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		uniqueIndex('api_tokens_hash_unique').on(table.tokenHash),
		index('api_tokens_user_idx').on(table.userId)
	]
);

// --- Plugin platform: data streams ---
//
// A "plugin" that produces data (a smart scale, a sleep tracker, a script)
// declares a stream and pushes points to it. Ontoplano renders streams with
// built-in generic renderers — producers never ship frontend code.

export const dataStreams = sqliteTable(
	'data_streams',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(), // 'a-private-plugin.weight'
		name: text('name').notNull(),
		source: text('source').notNull(), // producing app, e.g. 'a-private-plugin'
		kind: text('kind', { enum: ['measurement', 'event', 'counter', 'state'] }).notNull(),
		unit: text('unit').notNull().default(''),
		display: text('display', {
			enum: ['line_chart', 'calendar_heatmap', 'latest_value', 'bar_chart', 'list']
		})
			.notNull()
			.default('list'),
		config: text('config').notNull().default('{}'),
		showOnDashboard: integer('show_on_dashboard', { mode: 'boolean' }).notNull().default(false),
		archivedAt: text('archived_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		uniqueIndex('data_streams_user_slug_unique').on(table.userId, table.slug),
		index('data_streams_user_idx').on(table.userId)
	]
);

export const dataPoints = sqliteTable(
	'data_points',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		streamId: integer('stream_id')
			.notNull()
			.references(() => dataStreams.id, { onDelete: 'cascade' }),
		// Producer-supplied stable id. The unique index below is the entire
		// idempotency story: a phone retrying a lost request must not duplicate.
		externalId: text('external_id').notNull(),
		at: text('at').notNull(), // UTC ISO-8601 instant, with Z
		localDate: text('local_date').notNull(), // YYYY-MM-DD, civil date in the user's zone
		valueNum: real('value_num'),
		valueText: text('value_text'),
		meta: text('meta').notNull().default('{}'),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		uniqueIndex('data_points_stream_external_unique').on(table.streamId, table.externalId),
		index('data_points_stream_at_idx').on(table.streamId, table.at),
		index('data_points_user_idx').on(table.userId),
		index('data_points_stream_local_date_idx').on(table.streamId, table.localDate)
	]
);

export * from './auth.schema.js';

// --- Goals -------------------------------------------------------------------

/**
 * An area of life a goal belongs to: fitness, study, money, and whatever else
 * the user names. Seeded empty — the point of "manage life like a business" is
 * that the chart of accounts is yours.
 */
export const goalAreas = sqliteTable(
	'goal_areas',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		color: text('color').notNull().default('#6b7280'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('goal_areas_user_idx').on(table.userId),
		uniqueIndex('goal_areas_user_name_unique').on(table.userId, table.name)
	]
);

/**
 * A goal at some horizon, optionally hanging off a larger one.
 *
 * `parentId` is what makes a year decompose into quarters and a quarter into
 * weeks, rather than leaving six unrelated lists. `periodStart` anchors the
 * goal to a specific week or quarter, so "read 12 books" in 2026 and the same
 * goal in 2027 are different rows with their own progress.
 *
 * `targetValue` is optional: plenty of goals are "do the thing", not "do the
 * thing N times". When it is set, progress can be counted rather than felt.
 */
export const goals = sqliteTable(
	'goals',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		areaId: integer('area_id').references(() => goalAreas.id, { onDelete: 'set null' }),
		notebookId: integer('notebook_id').references(() => notebooks.id, { onDelete: 'set null' }),
		parentId: integer('parent_id'),
		title: text('title').notNull(),
		notes: text('notes').default(''),
		horizon: text('horizon', {
			enum: ['day', 'week', 'month', 'quarter', 'semester', 'year']
		}).notNull(),
		periodStart: text('period_start').notNull(), // YYYY-MM-DD, first day of the period
		targetValue: real('target_value'),
		currentValue: real('current_value').notNull().default(0),
		unit: text('unit').default(''),
		status: text('status', { enum: ['open', 'achieved', 'missed', 'abandoned'] })
			.notNull()
			.default('open'),
		outcome: text('outcome').default(''),
		closedAt: text('closed_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('goals_user_idx').on(table.userId),
		index('goals_period_idx').on(table.userId, table.horizon, table.periodStart),
		index('goals_parent_idx').on(table.parentId),
		index('goals_area_idx').on(table.areaId),
		index('goals_notebook_idx').on(table.notebookId),
		check('goals_target_positive', sql`${table.targetValue} IS NULL OR ${table.targetValue} > 0`)
	]
);

/**
 * Which tasks count towards a goal.
 *
 * A goal linked to tasks has progress that is a real number — how many of the
 * committed occurrences got done — rather than a self-report. Both kinds of
 * task can be linked, and exactly one column is set, the same shape
 * task_instances itself uses.
 */
export const goalLinks = sqliteTable(
	'goal_links',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		goalId: integer('goal_id')
			.notNull()
			.references(() => goals.id, { onDelete: 'cascade' }),
		slotId: integer('slot_id').references(() => weeklySlots.id, { onDelete: 'cascade' }),
		todoId: integer('todo_id').references(() => plannerTodos.id, { onDelete: 'cascade' }),
		activityId: integer('activity_id').references(() => activities.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('goal_links_user_idx').on(table.userId),
		index('goal_links_goal_idx').on(table.goalId),
		check(
			'goal_link_has_exactly_one_target',
			sql`(CASE WHEN ${table.slotId} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ${table.todoId} IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ${table.activityId} IS NULL THEN 0 ELSE 1 END) = 1`
		)
	]
);

// --- Dashboard -----------------------------------------------------------------

/**
 * Quotes the user wants to see on their dashboard.
 *
 * One is shown per day, picked deterministically from the date so it does not
 * change every time the page is refreshed — a quote that flickers is noise, and
 * one that holds for a day can actually land.
 */
export const quotes = sqliteTable(
	'quotes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		text: text('text').notNull(),
		author: text('author').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('quotes_user_idx').on(table.userId)]
);

/**
 * Three wins for a day.
 *
 * Previously these were written into the diary as text, which made them
 * unreportable — you could read last Tuesday's wins but never count them. Their
 * own table means a streak or a monthly tally is a query rather than a parse.
 */
export const dailyWins = sqliteTable(
	'daily_wins',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		forDate: text('for_date').notNull(), // YYYY-MM-DD
		position: integer('position').notNull(), // 1-based, so "win 2" stays win 2
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('daily_wins_user_date_idx').on(table.userId, table.forDate),
		uniqueIndex('daily_wins_slot_unique').on(table.userId, table.forDate, table.position)
	]
);

// --- Plugin manifests -----------------------------------------------------------

/**
 * What a plugin says about itself.
 *
 * Slot metadata is deliberately open — any key is accepted, so a plugin can
 * invent its own vocabulary without a schema change. The cost is that the keys
 * arrive anonymous: `hard_alarm` next to `location` with nothing saying which
 * program reads which, or what happens if you set it.
 *
 * A manifest is a plugin declaring, through the API and with its own token,
 * which keys it understands. The editor then shows provenance — "used by
 * a-private-plugin" — instead of a list that looks arbitrary.
 *
 * Per-user rather than global: one person's a-private-plugin may be a version behind
 * another's, and a manifest is a claim by an installation, not a fact about the
 * world.
 */
export const pluginManifests = sqliteTable(
	'plugin_manifests',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Matches data_streams.source, so a plugin is one name across both. */
		source: text('source').notNull(),
		name: text('name').notNull(),
		description: text('description').default(''),
		homepage: text('homepage').default(''),
		/**
		 * The keys this plugin reads, as JSON:
		 * [{ key, description, example }]. Stored as a blob because it is the
		 * plugin's vocabulary, not ours — validated on the way in, never joined on.
		 */
		metaKeys: text('meta_keys').notNull().default('[]'),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		uniqueIndex('plugin_manifests_user_source_unique').on(table.userId, table.source),
		index('plugin_manifests_user_idx').on(table.userId)
	]
);
