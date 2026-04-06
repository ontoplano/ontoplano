import { integer, sqliteTable, text, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name', { enum: ['duty', 'skill', 'money'] })
		.notNull()
		.unique()
});

export const activities = sqliteTable(
	'activities',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
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
		index('activities_category_idx').on(table.categoryId),
		index('activities_active_idx').on(table.active)
	]
);

export const weeklySlots = sqliteTable(
	'weekly_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		weekday: integer('weekday').notNull(), // 0=Mon … 6=Sun
		startTime: text('start_time').notNull(), // HH:MM
		durationMinutes: integer('duration_minutes').notNull().default(60),
		mode: text('mode', { enum: ['category', 'activity'] }).notNull(),
		categoryId: integer('category_id').references(() => categories.id),
		activityId: integer('activity_id').references(() => activities.id),
		label: text('label').default(''),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
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
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('diary_entries_created_idx').on(table.createdAt)]
);

export const tags = sqliteTable('tags', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique()
});

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

export const habits = sqliteTable('habits', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description').default(''),
	type: text('type', { enum: ['bad', 'good'] })
		.notNull()
		.default('bad'),
	scheduledDays: text('scheduled_days').default(''), // comma-separated weekday numbers (0=Mon..6=Sun), empty = every day
	createdAt: text('created_at')
		.notNull()
		.default(sql`(CURRENT_TIMESTAMP)`)
});

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

// --- Beliefs (memory reconsolidation) ---

export const beliefs = sqliteTable(
	'beliefs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('beliefs_created_idx').on(table.createdAt)]
);

export const beliefReasons = sqliteTable(
	'belief_reasons',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('belief_reasons_belief_idx').on(table.beliefId)]
);

export const beliefContradictions = sqliteTable(
	'belief_contradictions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [index('belief_contradictions_belief_idx').on(table.beliefId)]
);

export const beliefIntensities = sqliteTable(
	'belief_intensities',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		value: integer('value').notNull(),
		notes: text('notes').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('belief_intensities_belief_idx').on(table.beliefId),
		index('belief_intensities_date_idx').on(table.date),
		check('belief_intensities_value_range', sql`${table.value} >= 1 AND ${table.value} <= 10`)
	]
);

export const beliefHabits = sqliteTable(
	'belief_habits',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		habitId: integer('habit_id')
			.notNull()
			.references(() => habits.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('belief_habits_belief_idx').on(table.beliefId),
		index('belief_habits_habit_idx').on(table.habitId)
	]
);

export * from './auth.schema.js';
