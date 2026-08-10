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
		startTime: text('start_time').notNull(), // HH:MM
		durationMinutes: integer('duration_minutes').notNull().default(60),
		mode: text('mode', { enum: ['category', 'activity'] }).notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		activityId: integer('activity_id').references(() => activities.id),
		label: text('label').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
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

export const taskInstances = sqliteTable(
	'task_instances',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		slotId: integer('slot_id')
			.notNull()
			.references(() => weeklySlots.id),
		scheduledAt: text('scheduled_at').notNull(), // ISO 8601
		status: text('status', {
			enum: ['pending', 'completed', 'delayed', 'early', 'skipped']
		})
			.notNull()
			.default('pending'),
		completedAt: text('completed_at'),
		notes: text('notes').default(''),
		resolvedActivityId: integer('resolved_activity_id').references(() => activities.id),
		durationOverride: integer('duration_override'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('instances_user_idx').on(table.userId),
		index('instances_slot_idx').on(table.slotId),
		index('instances_scheduled_idx').on(table.scheduledAt),
		index('instances_status_idx').on(table.status),
		index('instances_slot_scheduled_idx').on(table.slotId, table.scheduledAt)
	]
);

// --- Diary ---

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
		entryId: integer('entry_id')
			.notNull()
			.references(() => diaryEntries.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
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
			.references(() => weeklySlots.id, { onDelete: 'cascade' })
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
		status: text('status', {
			enum: ['pending', 'completed', 'delayed', 'early', 'skipped']
		})
			.notNull()
			.default('pending'),
		completedAt: text('completed_at'),
		notes: text('notes').default(''),
		resolvedActivityId: integer('resolved_activity_id').references(() => activities.id),
		durationOverride: integer('duration_override'),
		meta: text('meta').notNull().default('{}'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('exceptional_slots_user_date_idx').on(table.userId, table.date),
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
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('planner_todos_user_idx').on(table.userId)]
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
	(table) => [index('scheme_slots_scheme_idx').on(table.schemeId)]
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
		ideaId: integer('idea_id')
			.notNull()
			.references(() => ideas.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('idea_tags_idea_idx').on(table.ideaId),
		index('idea_tags_tag_idx').on(table.tagId)
	]
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
