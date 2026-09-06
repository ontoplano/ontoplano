import {
	blob,
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
import { MAIL_KIND_NAMES } from '../../mail-kinds.js';

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

export const recurringTasks = sqliteTable(
	'recurring_tasks',
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
		/**
		 * How many minutes before this starts to be reminded, or null for not.
		 *
		 * On the block rather than on the occurrence, because that is where
		 * somebody says it: a reminder is a property of the thing being planned
		 * ("tell me ten minutes before gym"), not a separate object with a clock
		 * reading of its own. `generateForDate` turns it into a row in
		 * `reminders` for each occurrence as the occurrence appears.
		 */
		remindLeadMinutes: integer('remind_lead_minutes'),
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
		/**
		 * The recipe this block is for, when it is a meal.
		 *
		 * A meal is not a second kind of scheduling — it is a block on the same
		 * grid with something to cook attached, which is why the plan shows dinner
		 * next to deep work and why "what does this week need" is a join.
		 */
		recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),

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
export const taskRecords = sqliteTable(
	'task_records',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		slotId: integer('slot_id').references(() => recurringTasks.id),
		exceptionalSlotId: integer('exceptional_slot_id').references(() => exceptionalTasks.id, {
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
		/**
		 * Opt-in, per notebook, by its owner: everybody on the owner's family
		 * plan can read it and write their own entries into it. The rows keep
		 * their writers' user_id — sharing widens who may look, never who owns.
		 */
		sharedWithFamily: integer('shared_with_family', { mode: 'boolean' }).notNull().default(false),
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
		/**
		 * The three things you actually look somebody up for.
		 *
		 * All optional, and stored as written rather than parsed: a phone number
		 * is a string in every country that has ever tried to make it a number,
		 * and a birthday you only know the day of ("14 March, no idea which
		 * year") is still worth keeping. YYYY-MM-DD where the year is known,
		 * --MM-DD where it is not, which is the shape vCard uses for the same
		 * reason.
		 */
		birthday: text('birthday'),
		/**
		 * Whether the birthday above is worth being interrupted for.
		 *
		 * On by default, because somebody who typed a birthday into an address
		 * book typed it in order to remember it. Off is for the birthdays you
		 * keep and do not celebrate — a colleague, an ex-landlord — and it is a
		 * per-person switch rather than one setting for all of them, since that
		 * is how the wish actually falls.
		 */
		remindOnBirthday: integer('remind_on_birthday', { mode: 'boolean' }).notNull().default(true),
		phone: text('phone'),
		email: text('email'),
		notes: text('notes').default(''),
		/**
		 * One picture, so a list of names is a list of faces.
		 *
		 * One rather than a gallery: this is a face, and a second one of the same
		 * person answers no question the first did not. `set null` on delete, so
		 * removing the picture leaves the person — the opposite would be a way to
		 * lose somebody by tidying up.
		 */
		pictureId: integer('picture_id').references(() => media.id, { onDelete: 'set null' }),
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
		/**
		 * The notebook's own numbering, for an entry that belongs to one.
		 *
		 * `seq` counts every piece of writing in the account, which is what the
		 * diary's `#12` references mean. A note inside a notebook is numbered by
		 * that notebook instead — the fourth note about the kitchen is #4, not
		 * #36 — so it is a second number rather than a different one. Null for
		 * anything with no notebook.
		 */
		notebookSeq: integer('notebook_seq'),
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
		uniqueIndex('diary_entries_user_seq_unique').on(table.userId, table.seq),
		// SQLite treats NULLs as distinct, so every entry outside a notebook is
		// exempt and the numbering inside one cannot collide.
		uniqueIndex('diary_entries_notebook_seq_unique').on(table.notebookId, table.notebookSeq)
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
			.references(() => recurringTasks.id, { onDelete: 'cascade' }),
		/**
		 * Set when this day was *moved* rather than skipped.
		 *
		 * A skip means "not happening today", and the grid keeps showing it
		 * greyed so it can be put back. A move means "happening, but there
		 * instead" — the replacement is what should be on screen, and leaving
		 * the original visible makes one block look like two.
		 */
		movedToId: integer('moved_to_id').references(() => exceptionalTasks.id, {
			onDelete: 'set null'
		})
	},
	(table) => [
		index('suppressed_slots_user_date_idx').on(table.userId, table.date),
		uniqueIndex('suppressed_slots_unique').on(table.userId, table.date, table.slotId)
	]
);

export const exceptionalTasks = sqliteTable(
	'exceptional_tasks',
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
		/**
		 * How many minutes before this starts to be reminded, or null for not.
		 *
		 * On the block rather than on the occurrence, because that is where
		 * somebody says it: a reminder is a property of the thing being planned
		 * ("tell me ten minutes before gym"), not a separate object with a clock
		 * reading of its own. `generateForDate` turns it into a row in
		 * `reminders` for each occurrence as the occurrence appears.
		 */
		remindLeadMinutes: integer('remind_lead_minutes'),
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

		/** The recipe this block is for, when it is a meal. See `recurring_tasks`. */
		recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('exceptional_tasks_user_date_idx').on(table.userId, table.date),
		index('exceptional_tasks_notebook_idx').on(table.notebookId),
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

export const todoTasks = sqliteTable(
	'todo_tasks',
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
		index('todo_tasks_user_idx').on(table.userId),
		index('todo_tasks_scheduled_idx').on(table.userId, table.scheduledDate),
		index('todo_tasks_notebook_idx').on(table.notebookId),
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
		/**
		 * Opt-in, per section, by its owner: everybody on the owner's family
		 * plan sees the section and its items, and can add, tick and remove
		 * items in it — one household, one list of what is out of milk.
		 */
		sharedWithFamily: integer('shared_with_family', { mode: 'boolean' }).notNull().default(false),
		/**
		 * Whether things in this category can be an ingredient.
		 *
		 * The category decides, not the item — otherwise every tin of tomatoes
		 * has to be marked by hand and the television has to be marked as not.
		 * Ticked once per category, in settings.
		 */
		isFood: integer('is_food', { mode: 'boolean' }).notNull().default(false),
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
		/**
		 * The last known price, in the smallest unit of the account's currency.
		 *
		 * Not a truth — shops disagree and prices move — which is why the UI says
		 * "about" and offers to update it when something is ticked as bought.
		 * Null means nobody has said.
		 */
		priceCents: integer('price_cents'),
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

// --- Recipes ---

/**
 * Something you cook.
 *
 * The reason it is here rather than in a cookbook app is the loop it closes:
 * a recipe is put on a day like anything else, and what the week's meals need
 * minus what is already in the cupboard is the shopping list. A recipe on its
 * own is worth less than the fifth-best free cookbook; the link to the plan and
 * the list is the whole point.
 */
export const recipes = sqliteTable(
	'recipes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		title: text('title').notNull(),
		/** Free text, rendered as Markdown like a diary entry. */
		method: text('method').notNull().default(''),
		notes: text('notes').default(''),
		servings: integer('servings'),
		minutes: integer('minutes'),
		/** Where it came from, when it was pasted from somewhere. */
		source: text('source').default(''),
		lastCookedAt: text('last_cooked_at'),
		archivedAt: text('archived_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('recipes_user_idx').on(table.userId),
		check('recipes_servings_positive', sql`${table.servings} IS NULL OR ${table.servings} > 0`),
		check('recipes_minutes_positive', sql`${table.minutes} IS NULL OR ${table.minutes} > 0`)
	]
);

/**
 * A picture, kept in the same file as everything else.
 *
 * The bytes are a column here rather than a file in a directory beside the
 * database, and that is the deliberate half. What this app promises is that
 * your data is one SQLite file you can copy, export and walk away with; a media
 * directory makes it two things that have to travel together, and the backup
 * that took one of them and not the other looks exactly like a backup. Under a
 * megabyte a row SQLite reads a blob faster than the filesystem opens a file,
 * and the ceiling is the operator's (`[media] max_kilobytes`), so this cannot
 * quietly become the reason the file is unmanageable.
 *
 * `mime` is decided by the server from the bytes themselves, never from what
 * the browser said it was sending, and SVG is not on the list: it is a document
 * that can carry script, and it would be served from this app's own origin.
 */
export const media = sqliteTable(
	'media',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		mime: text('mime').notNull(),
		/** What the person's file was called. Shown; never used as a path. */
		filename: text('filename').notNull().default(''),
		alt: text('alt').notNull().default(''),
		byteSize: integer('byte_size').notNull(),
		bytes: blob('bytes', { mode: 'buffer' }).notNull(),
		/** The same picture twice is one row: see `sha256` in `services/media.ts`. */
		sha256: text('sha256').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('media_user_idx').on(table.userId),
		uniqueIndex('media_user_sha_unique').on(table.userId, table.sha256),
		check('media_size_positive', sql`${table.byteSize} > 0`)
	]
);

/**
 * Which pictures belong to which recipe, and which one is the recipe.
 *
 * An explicit join rather than a markdown reference — the way a notebook entry
 * carries its pictures — because these are not illustrations inside a text.
 * They are the recipe's own gallery: they have an order, one of them is the one
 * the list shows, and the number of them is capped.
 *
 * A partial unique index does the "one main" rule in the database rather than
 * in whichever code path happens to be setting it, so two mains cannot exist
 * even for a moment.
 */
export const recipeImages = sqliteTable(
	'recipe_images',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		mediaId: integer('media_id')
			.notNull()
			.references(() => media.id, { onDelete: 'cascade' }),
		position: integer('position').notNull().default(0),
		isMain: integer('is_main', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('recipe_images_user_idx').on(table.userId),
		index('recipe_images_recipe_idx').on(table.recipeId),
		uniqueIndex('recipe_images_once_unique').on(table.recipeId, table.mediaId),
		uniqueIndex('recipe_images_one_main_unique')
			.on(table.recipeId)
			.where(sql`is_main = 1`)
	]
);

/**
 * An ingredient: a shopping item, an amount, and how it is prepared.
 *
 * It points at `shopping_items` rather than holding a name of its own, which is
 * what makes "what does this week need" a join rather than a text-matching
 * problem. Writing a recipe therefore fills the shopping list as a side effect,
 * which is the only way any of this stays current.
 *
 * `unit` is free text and `quantity` is a plain number. No conversion: 100ml of
 * onion is not a thing, and a list that says "2 tbsp, 100 ml" is honest where a
 * total would be invented.
 */
export const recipeItems = sqliteTable(
	'recipe_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		itemId: integer('item_id')
			.notNull()
			.references(() => shoppingItems.id, { onDelete: 'cascade' }),
		quantity: real('quantity'),
		unit: text('unit').default(''),
		note: text('note').default(''),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(table) => [
		index('recipe_items_user_idx').on(table.userId),
		index('recipe_items_recipe_idx').on(table.recipeId),
		index('recipe_items_item_idx').on(table.itemId),
		uniqueIndex('recipe_items_unique').on(table.recipeId, table.itemId),
		check('recipe_items_quantity_positive', sql`${table.quantity} IS NULL OR ${table.quantity} > 0`)
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
		plan: text('plan', { enum: ['none', 'pro'] })
			.notNull()
			.default('none'),
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
		/** When the "your trial ends soon" mail went out, so it goes out once. */
		trialNoticeSentAt: text('trial_notice_sent_at'),
		/** Set when a cancellation is scheduled but the period is still running. */
		cancelAt: text('cancel_at'),
		/** Where the provider lets this customer manage their own card. */
		portalUrl: text('portal_url'),
		/**
		 * How many accounts this subscription covers, the payer included.
		 *
		 * One for the ordinary plan. A family plan is not a different product —
		 * it is the same subscription with a bigger number here, which is why
		 * there is no second entitlement model to keep in step.
		 */
		seats: integer('seats').notNull().default(1),
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
 * Who else is on somebody's plan.
 *
 * A family plan is one subscription paying for several accounts. Rather than
 * copying a subscription onto each of them — which would need keeping in step
 * with the provider five times over, and would leave four rows nobody is
 * paying for when the payer cancels — a member has no subscription of their
 * own and resolves through the payer's.
 *
 * Nothing is shared but the invoice. Two people on one plan see none of each
 * other's data, and the app has no notion of a shared week: the entitlement is
 * the only thing that crosses.
 */
export const planMembers = sqliteTable(
	'plan_members',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Whose subscription pays for this seat. */
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id),
		/** The account the seat belongs to. */
		memberId: text('member_id')
			.notNull()
			.references(() => user.id),
		/**
		 * When the account agreed to it — null while it is only an offer.
		 *
		 * A payer typing an address must not be able to move somebody else's
		 * account onto their plan: being a member is a thing with consequences
		 * (their billing page becomes somebody else's, and the payer can take
		 * the seat away again), so it is something the other account says yes
		 * to. A pending row holds the seat and grants nothing.
		 *
		 * The exception is an account this payer had made for them a minute
		 * ago, which is accepted on creation: it never existed independently,
		 * so there is nobody to ask.
		 */
		acceptedAt: text('accepted_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('plan_members_owner_idx').on(table.ownerId),
		// One seat per account: being on two plans at once is a question with no
		// good answer, and the second payer would be paying for nothing.
		uniqueIndex('plan_members_member_unique').on(table.memberId)
	]
);

/**
 * Every checkout this instance has opened, and whether its result ever landed.
 *
 * The app used to learn about a payment in exactly one way: the provider's
 * webhook. When that stopped arriving — the destination was left pointing at a
 * hostname that had become a redirect, and the provider does not follow those —
 * somebody paid, got a receipt by mail, came back, and was shown the pay page
 * again. Nothing in the app knew a payment had happened, and the nightly
 * reconcile could not help either: it walks subscription rows, and the row is
 * what never got written.
 *
 * So the checkout is written down when it is opened, before the customer
 * leaves. Coming back, the app can ask the provider what became of THIS
 * transaction and act on the answer, and a sweep can do the same later for
 * anybody who closed the tab. The webhook stays the fast path; this is the
 * one that cannot go quiet.
 */
export const billingCheckouts = sqliteTable(
	'billing_checkouts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		provider: text('provider').notNull(),
		/** The provider's id for the transaction this checkout is paying. */
		providerTransactionId: text('provider_transaction_id').notNull(),
		/** Set once the app has read the outcome and written it down. */
		settledAt: text('settled_at'),
		/**
		 * How the outcome was learnt: 'webhook' when the provider told us, and
		 * 'claim' when it did not and we had to ask. A row full of 'claim' means
		 * the webhook is broken, which is why it is recorded rather than inferred.
		 */
		settledBy: text('settled_by', { enum: ['webhook', 'claim'] }),
		/**
		 * When a webhook for this transaction arrived — set even if the claim
		 * path had already settled the row, because the alert's real question
		 * is "did the provider ever reach us", not "who wrote the row first".
		 * A customer who returns to the success page makes the claim win the
		 * race; that is not a broken webhook, and this is how the two are told
		 * apart.
		 */
		webhookSeenAt: text('webhook_seen_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('billing_checkouts_user_idx').on(table.userId),
		uniqueIndex('billing_checkouts_transaction_unique').on(table.providerTransactionId)
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
/**
 * What broke in somebody's browser, when they said we could hear about it.
 *
 * Kept for the administrator to look at, not for the account: this is
 * operational exhaust, and the person it happened to has no use for it. So the
 * account reference is nullable and is cleared rather than cascaded when an
 * account goes — a stack trace with no name on it is still a bug worth fixing,
 * and keeping the name would make this the account's data, which it is not.
 *
 * Swept to a ceiling on write (see services/client-errors.ts). A table nobody
 * prunes is a table that eats the disk of a box with 2GB free.
 */
export const clientErrors = sqliteTable(
	'client_errors',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Null once the account it happened to has been deleted. */
		userId: text('user_id'),
		message: text('message').notNull(),
		url: text('url'),
		stack: text('stack'),
		/** Which browser, as it described itself. Nothing is inferred from it. */
		userAgent: text('user_agent'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('client_errors_created_idx').on(table.createdAt)]
);

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
		/**
		 * How long what the invitation hands over lasts, as an instant.
		 *
		 * Two different clocks live on this row and confusing them is the whole
		 * reason for this comment. `expires_at` is the code's own life — after it,
		 * the code no longer works. This is the life of what the code hands over:
		 * the account runs until this moment, then it lapses like any other.
		 *
		 * Null is the alpha invitation: no end date and no billing
		 * anywhere in its interface, until the operator says otherwise.
		 */
		grantsUntil: text('grants_until'),
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
// Tokens are how external apps (scripts, phone apps, future plugins) talk to
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
		/*
		 * The one kind of token that is kept in the clear, and why.
		 *
		 * Every other token is a hash: shown once, never recoverable, because a
		 * stolen database must not be a set of working keys. A calendar link is
		 * different in what it can do — read the plan, and nothing else — and
		 * different in how it is used: it lives in a URL pasted into a calendar
		 * app, and "set it up on the phone, then want it on the laptop a
		 * fortnight later" is the ordinary case rather than the careless one.
		 * Storing that one address so it can be shown again costs a blast radius
		 * of "can read your plan", which anybody holding the database has anyway.
		 *
		 * Null for every token that is not a calendar link.
		 */
		plaintext: text('plaintext'),
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

/**
 * Webhook subscriptions — the other half of the plugin platform.
 *
 * Streams let an external program push data in; this lets one hear about
 * things happening, without running any code inside the process. A
 * subscription is an address, the events it wants, and a secret the delivery
 * is signed with so the receiver can check it is really us.
 */
export const webhookSubscriptions = sqliteTable(
	'webhook_subscriptions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		/** Comma-separated event names from services/webhooks.ts. */
		events: text('events').notNull(),
		/** Plaintext by necessity: deliveries are signed with it. */
		secret: text('secret').notNull(),
		lastDeliveryAt: text('last_delivery_at'),
		lastStatus: integer('last_status'),
		failCount: integer('fail_count').notNull().default(0),
		/** Set when consecutive failures give up on the address. */
		disabledAt: text('disabled_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [index('webhook_subscriptions_user_idx').on(table.userId)]
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
		slug: text('slug').notNull(), // 'scale.weight'
		name: text('name').notNull(),
		source: text('source').notNull(), // producing app, e.g. 'scale'
		kind: text('kind', { enum: ['measurement', 'event', 'counter', 'state'] }).notNull(),
		unit: text('unit').notNull().default(''),
		display: text('display', {
			enum: ['line_chart', 'calendar_heatmap', 'latest_value', 'bar_chart', 'list']
		})
			.notNull()
			.default('list'),
		config: text('config').notNull().default('{}'),
		showOnDashboard: integer('show_on_dashboard', { mode: 'boolean' }).notNull().default(false),
		// How many days of points to keep. Null keeps everything; the sweep in
		// services/streams.ts deletes what is past this, nightly and on push.
		retentionDays: integer('retention_days'),
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
 * task_records itself uses.
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
		slotId: integer('slot_id').references(() => recurringTasks.id, { onDelete: 'cascade' }),
		todoId: integer('todo_id').references(() => todoTasks.id, { onDelete: 'cascade' }),
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

/**
 * A calendar somebody else controls.
 *
 * A plan that ignores the calendar you do not control is fiction: the meetings
 * happen whether or not this app knows about them. Read-only and one-way on
 * purpose — every calendar worth subscribing to publishes an `.ics` (Google
 * calls it the "secret address in iCal format"), which means no OAuth, no
 * tokens to keep safe, and nobody in the path but the server already hosting
 * the calendar.
 *
 * The file itself is kept rather than the events it contains. It is a few
 * hundred kilobytes at most, expanding it is cheap, and a second copy of
 * somebody else's calendar in our own tables would be a second thing to keep
 * correct.
 */
export const calendarFeeds = sqliteTable(
	'calendar_feeds',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		url: text('url').notNull(),
		/** Drawn in this, so two calendars are told apart at a glance. */
		color: text('color').notNull().default('#6b7280'),
		/** The last file fetched, whole. Null until the first successful fetch. */
		body: text('body'),
		fetchedAt: text('fetched_at'),
		/** What went wrong last time, shown on the page rather than swallowed. */
		lastError: text('last_error'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('calendar_feeds_user_idx').on(table.userId)]
);

/**
 * A nudge at a time.
 *
 * The app only helps on the days you remember to open it, which is why most
 * people who try a planner stop in week two. A reminder is the one thing that
 * reaches out rather than waiting to be visited.
 *
 * Deliberately a row rather than a rule on the block: a rule would have to be
 * evaluated everywhere, and a row can be delivered by anything with the
 * database — the page you have open, or the push delivery job while the app
 * is closed, with nobody else in the path.
 */
export const reminders = sqliteTable(
	'reminders',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		/** What it is about. `free` is a reminder that is only itself. */
		subjectKind: text('subject_kind', { enum: ['instance', 'todo', 'free', 'person'] })
			.notNull()
			.default('free'),
		subjectId: integer('subject_id'),
		/**
		 * Wall-clock, like `task_records.scheduled_at` — not an instant.
		 *
		 * "Remind me at ten to nine" means ten to nine wherever you are, and a
		 * reminder that shifts by an hour because you flew somewhere is a reminder
		 * that is wrong. Compared against the local time in the account's zone.
		 */
		remindAt: text('remind_at').notNull(),
		message: text('message').notNull(),
		/** Set the moment something showed it to somebody, so nothing fires twice. */
		deliveredAt: text('delivered_at'),
		/**
		 * Set when it was pushed to a device, which is a different question.
		 *
		 * `delivered_at` means "an open page has put this on screen"; this means
		 * "it left the server for somebody's phone". Two stamps because the two
		 * channels must not consume each other: a reminder that reached a locked
		 * phone at 08:50 should still be on the planner when the laptop is opened
		 * at nine, and a card dismissed on the laptop should not cause the phone
		 * to be pushed the same thing again an hour later.
		 */
		pushedAt: text('pushed_at'),
		/** Set when the person acknowledged it. */
		dismissedAt: text('dismissed_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('reminders_user_idx').on(table.userId),
		// The delivery query is "mine, due, undelivered", and it runs every minute.
		index('reminders_due_idx').on(table.userId, table.deliveredAt, table.remindAt),
		index('reminders_subject_idx').on(table.subjectKind, table.subjectId)
	]
);

/**
 * One browser that has agreed to be interrupted.
 *
 * A row per device per browser, not per account: somebody granting permission
 * on a laptop has said nothing about their phone, and revoking it on one must
 * not silence the other. The endpoint is the address the push service gave us
 * and it is what identifies the row — the same browser re-subscribing hands
 * back the same endpoint, so an upsert on it is what keeps this table from
 * growing a row per visit.
 *
 * ## What the keys are, and what they are not
 *
 * `p256dh` and `auth` are the browser's half of an encryption pair. Everything
 * sent through the push service is encrypted with them before it leaves here,
 * so the relay — Mozilla's, Google's, Apple's — carries ciphertext it cannot
 * read. They are not credentials for anything of ours: somebody holding this
 * table can push notifications at these browsers and learn nothing about the
 * accounts behind them.
 *
 * ## Failures are counted, not ignored
 *
 * A subscription dies quietly: the browser is uninstalled, the permission
 * revoked, the phone reset. The push service then answers 404 or 410 for that
 * endpoint forever, and those two delete the row on the spot. Anything else
 * increments `failures`, and a row that has failed enough times running is
 * dropped — an endpoint that is permanently broken but retried every minute is
 * a request every minute, for years.
 */
export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** The push service's address for this browser. Unique: it is the identity. */
		endpoint: text('endpoint').notNull(),
		/** The browser's public key, base64url. */
		p256dh: text('p256dh').notNull(),
		/** The browser's auth secret, base64url. */
		auth: text('auth').notNull(),
		/** Only so somebody can tell their own devices apart when revoking one. */
		label: text('label'),
		/** Consecutive failures. Any success resets it; enough of them drops the row. */
		failures: integer('failures').notNull().default(0),
		lastPushAt: text('last_push_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('push_subscriptions_user_idx').on(table.userId),
		uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint)
	]
);

/**
 * What something cost, when you bought it.
 *
 * `shopping_items.price_cents` is a *last known* price — useful for "what will
 * this shop cost" and useless for anything over time, because it is overwritten.
 * A row per purchase is the other question: milk has gone from 1.20 to 1.60
 * this year, and nobody else's app will tell you that.
 *
 * Written only when somebody actually says what they paid. A price nobody
 * confirmed is a guess, and a chart built out of guesses is worse than no
 * chart.
 */
export const pricePoints = sqliteTable(
	'price_points',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		itemId: integer('item_id')
			.notNull()
			.references(() => shoppingItems.id, { onDelete: 'cascade' }),
		priceCents: integer('price_cents').notNull(),
		/** The day it was bought, not the instant it was typed in. */
		forDate: text('for_date').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('price_points_user_item_idx').on(table.userId, table.itemId),
		index('price_points_date_idx').on(table.forDate)
	]
);

/**
 * What a week came to.
 *
 * The planner has always held the numbers and nothing ever asked anyone
 * to look at them, which is the difference between a tracker and a habit. A
 * review is written once per week and is the only thing in the app that is
 * *about* a stretch of time rather than a moment in it.
 *
 * Three lines, positioned like the daily wins, because a page that offers a
 * blank textarea for "how was your week" gets used twice.
 */
export const weeklyReviews = sqliteTable(
	'weekly_reviews',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		weekStart: text('week_start').notNull(), // YYYY-MM-DD, always a Monday
		position: integer('position').notNull(), // 1-based, so "line 2" stays line 2
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('weekly_reviews_user_week_idx').on(table.userId, table.weekStart),
		uniqueIndex('weekly_reviews_slot_unique').on(table.userId, table.weekStart, table.position)
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
 * which keys it understands. The editor then shows provenance — "used by the
 * alarm app" — instead of a list that looks arbitrary.
 *
 * Per-user rather than global: one person's copy of a plugin may be a version
 * behind another's, and a manifest is a claim by an installation, not a fact
 * about the world.
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

// --- Instance: outbound mail that could not be sent ---

/**
 * Every mail the app failed to deliver, so a broken mailer is a visible,
 * retryable fact instead of a silence. `/healthz` counts the open rows as a
 * warning (which is what the off-box watchers alert on) and `/admin` lists
 * them. A row resolves when a later send to the same address for the same
 * kind succeeds, when a retry succeeds, or when an administrator dismisses it.
 *
 * The body is stored only for mail worth re-sending later (the trial notice).
 * Auth mail — verification, reset, address change — carries links that expire
 * within the hour, so those rows record the failure and nothing else; the fix
 * is a fresh request, not a replay.
 */
export const mailFailures = sqliteTable(
	'mail_failures',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		// From `$lib/mail-kinds`, so a new kind of mail cannot be storable without
		// also being nameable in the list on /admin. Text either way in SQLite —
		// the enum is drizzle's, so no migration follows from adding one.
		kind: text('kind', { enum: MAIL_KIND_NAMES }).notNull(),
		toEmail: text('to_email').notNull(),
		subject: text('subject').notNull(),
		/** What sending reported, trimmed — shown verbatim on /admin. */
		error: text('error').notNull(),
		attempts: integer('attempts').notNull().default(1),
		bodyText: text('body_text'),
		bodyHtml: text('body_html'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		lastAttemptAt: text('last_attempt_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		resolvedAt: text('resolved_at')
	},
	(table) => [index('mail_failures_open_idx').on(table.resolvedAt)]
);

/**
 * People who asked to be told when this changes.
 *
 * Not accounts, and deliberately nothing like one: an address, whether it has
 * been confirmed, and a token. Nobody here can sign in, and no row is joined to
 * a `user` — somebody who subscribed and later signed up is two unrelated
 * facts, which is the correct relationship between "wants the newsletter" and
 * "has an account".
 *
 * ## Why the app holds this at all
 *
 * Every other way of reaching somebody who liked this — a subreddit, a feed
 * ranking, a search position — is rented, and the day the algorithm changes the
 * audience is gone. An address somebody handed over is the one channel nobody
 * else can take away. The alternative was a hosted list, which means a third
 * party in the path for the one asset that is supposed to be un-take-away-able.
 *
 * It is off unless the instance turns it on: a self-hosted install has no
 * newsletter to send and this table stays empty forever, which is right.
 *
 * ## Double opt-in, and why the token outlives the confirmation
 *
 * A row is created unconfirmed and stays that way until its link is followed —
 * so typing somebody else's address into the form subscribes nobody. The same
 * token is what the unsubscribe link in every issue carries, which is why it is
 * not cleared on confirmation: a way in that becomes no way out is the thing
 * that gets a domain filed as spam.
 */
export const subscribers = sqliteTable(
	'subscribers',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Lower-cased on the way in, so one address cannot be two rows. */
		email: text('email').notNull().unique(),
		/** Confirms this address, and later unsubscribes it. Never reissued. */
		token: text('token').notNull().unique(),
		/** Where the form was. Nothing personal — 'site', 'app'. */
		source: text('source').notNull().default('site'),
		confirmedAt: text('confirmed_at'),
		unsubscribedAt: text('unsubscribed_at'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('subscribers_confirmed_idx').on(table.confirmedAt)]
);

// --- Finance: Bills ---
//
// A bill is money expected to go out on a rhythm — rent, a subscription, the
// water. Distinct from `billing_*`, which is Paddle taking money in; this is
// the person's own outgoings, and it reuses `categories` and links to `goals`
// like every other room. Marking one paid writes a `bill_payments` row that
// records what was actually paid, which may differ from what was expected —
// and that gap is the seed the rest of a finance section measures from.

export const bills = sqliteTable(
	'bills',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		// Minor units (cents), because money in a float is a bug waiting for a
		// rounding. The currency is the person's, resolved in the service from a
		// setting rather than hardcoded — null means "the account's default".
		amountExpected: integer('amount_expected').notNull().default(0),
		currency: text('currency'),
		// The day of the month it falls due, 1-28 to be real on every month.
		// Null for a rhythm that is not monthly.
		dueDay: integer('due_day'),
		// How many days before the due day it should appear on the week.
		//
		// The due day is the LAST day it can be paid; most bills want paying
		// before that. This is that lead, so "rent, due the 5th, pay it on the
		// 2nd" is one number rather than a second date to keep in step.
		payLeadDays: integer('pay_lead_days').notNull().default(0),
		rhythm: text('rhythm', { enum: ['weekly', 'monthly', 'yearly', 'once'] })
			.notNull()
			.default('monthly'),
		categoryId: integer('category_id').references(() => categories.id),
		// Bills link to goals like everything else — "clear the card" is a goal
		// its payments move toward.
		goalId: integer('goal_id').references(() => goals.id, { onDelete: 'set null' }),
		notes: text('notes').default(''),
		// A bill that is no longer paid is archived, not deleted: its history is
		// the point, and deleting it would take the payments with it.
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('bills_user_idx').on(table.userId),
		index('bills_active_idx').on(table.userId, table.active),
		check('bills_rhythm_dueday', sql`${table.dueDay} IS NULL OR ${table.dueDay} BETWEEN 1 AND 28`)
	]
);

export const billPayments = sqliteTable(
	'bill_payments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		billId: integer('bill_id')
			.notNull()
			.references(() => bills.id, { onDelete: 'cascade' }),
		// Which occurrence this settles: 'YYYY-MM' for a monthly bill, 'YYYY'
		// for a yearly one, the pay date for a one-off. One payment per period,
		// so paying twice corrects the first rather than doubling it.
		period: text('period').notNull(),
		// What was expected when it was paid, snapshotted — the bill's expected
		// amount can change later, and the gap is measured against what was
		// actually asked at the time.
		amountExpected: integer('amount_expected').notNull().default(0),
		amountPaid: integer('amount_paid').notNull().default(0),
		currency: text('currency'),
		paidAt: text('paid_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		notes: text('notes').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('bill_payments_user_idx').on(table.userId),
		index('bill_payments_bill_idx').on(table.billId),
		uniqueIndex('bill_payments_bill_period_unique').on(table.billId, table.period)
	]
);
