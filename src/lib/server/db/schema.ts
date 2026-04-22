import { integer, sqliteTable, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
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

// --- Beliefs (memory reconsolidation) ---

export const beliefs = sqliteTable(
	'beliefs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		content: text('content').notNull(),
		valence: text('valence', { enum: ['positive', 'negative'] }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('beliefs_user_idx').on(table.userId),
		index('beliefs_created_idx').on(table.createdAt)
	]
);

export const beliefRelations = sqliteTable(
	'belief_relations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sourceBeliefId: integer('source_belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		targetBeliefId: integer('target_belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		type: text('type', { enum: ['supports', 'contradicts'] }).notNull(),
		notes: text('notes').default(''),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('belief_relations_source_idx').on(table.sourceBeliefId),
		index('belief_relations_target_idx').on(table.targetBeliefId)
	]
);

export const evidence = sqliteTable(
	'evidence',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		content: text('content').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('evidence_user_idx').on(table.userId),
		index('evidence_created_idx').on(table.createdAt)
	]
);

export const beliefEvidence = sqliteTable(
	'belief_evidence',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		evidenceId: integer('evidence_id')
			.notNull()
			.references(() => evidence.id, { onDelete: 'cascade' }),
		type: text('type', { enum: ['supports', 'contradicts'] }).notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`)
	},
	(table) => [
		index('belief_evidence_belief_idx').on(table.beliefId),
		index('belief_evidence_evidence_idx').on(table.evidenceId)
	]
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

export const beliefTags = sqliteTable(
	'belief_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		beliefId: integer('belief_id')
			.notNull()
			.references(() => beliefs.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('belief_tags_belief_idx').on(table.beliefId),
		index('belief_tags_tag_idx').on(table.tagId)
	]
);

// --- Shopping List ---

export const shoppingItems = sqliteTable(
	'shopping_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		name: text('name').notNull(),
		type: text('type', { enum: ['someday', 'replenish'] }).notNull(),
		notes: text('notes').default(''),
		bought: integer('bought', { mode: 'boolean' }).notNull().default(false),
		boughtAt: text('bought_at'),
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
		index('shopping_items_bought_idx').on(table.bought)
	]
);

export const graphViews = sqliteTable(
	'graph_views',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		data: text('data').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(CURRENT_TIMESTAMP)`),
		updatedAt: text('updated_at')
	},
	(table) => [index('graph_views_user_idx').on(table.userId)]
);

export * from './auth.schema.js';
