// Run: npx tsx src/lib/server/db/seed-dev.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import {
	categories,
	activities,
	weeklySlots,
	taskInstances,
	diaryEntries,
	tags,
	diaryEntryTags,
	habits,
	habitOccurrences
} from './schema.js';
import { user, account } from './auth.schema.js';

const config = loadConfig();
const client = new Database(config.database.path);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');
const db = drizzle(client);

const DEV_EMAIL = 'dev@ontoplano.user';
const DEV_PASSWORD = 'dev';
const DEV_NAME = 'Dev User';

function generateId(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function datetimeDaysAgo(n: number, hour = 12, min = 0): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(hour, min, 0, 0);
	return (
		d.getFullYear() +
		'-' +
		String(d.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(d.getDate()).padStart(2, '0') +
		'T' +
		String(d.getHours()).padStart(2, '0') +
		':' +
		String(d.getMinutes()).padStart(2, '0') +
		':00'
	);
}

// Hash password using the same scrypt params as better-auth
async function hashPassword(password: string): Promise<string> {
	const { scryptAsync } = await import('@noble/hashes/scrypt.js');
	const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
	const key = await scryptAsync(password.normalize('NFKC'), salt, {
		N: 16384,
		p: 1,
		r: 16,
		dkLen: 64,
		maxmem: 128 * 16384 * 16 * 2
	});
	return `${salt}:${Buffer.from(key).toString('hex')}`;
}

async function seed() {
	// Check if dev user already exists
	const existing = db.select().from(user).where(eq(user.email, DEV_EMAIL)).get();
	if (existing) {
		console.log(`Dev user ${DEV_EMAIL} already exists (id: ${existing.id}). Skipping.`);
		client.close();
		return;
	}

	// Create dev user
	const userId = generateId();
	const now = new Date();
	db.insert(user)
		.values({
			id: userId,
			name: DEV_NAME,
			email: DEV_EMAIL,
			emailVerified: false,
			createdAt: now,
			updatedAt: now
		})
		.run();

	// Create account with hashed password
	const passwordHash = await hashPassword(DEV_PASSWORD);
	const accountId = generateId();
	db.insert(account)
		.values({
			id: accountId,
			accountId: userId,
			providerId: 'credential',
			userId: userId,
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		})
		.run();

	console.log(`  ✓ Created dev user: ${DEV_EMAIL} (password: ${DEV_PASSWORD})`);

	// Ensure categories exist for this user
	const cats = db.select().from(categories).where(eq(categories.userId, userId)).all();
	if (cats.length === 0) {
		db.insert(categories)
			.values([
				{ userId, name: 'duty', color: '#3b82f6', colorLight: '#dbeafe' },
				{ userId, name: 'skill', color: '#22c55e', colorLight: '#dcfce7' },
				{ userId, name: 'money', color: '#f59e0b', colorLight: '#fef3c7' }
			])
			.run();
		console.log('  ✓ Seeded categories for dev user');
	}
	const catMap = Object.fromEntries(
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.all()
			.map((c) => [c.name, c.id])
	);

	// ── Activities ──────────────────────────────────────────────────────────
	const activityData = [
		{ name: 'Learn Russian', categoryId: catMap.skill, description: 'Anki + grammar drills' },
		{ name: 'Gym', categoryId: catMap.duty, description: 'Strength training' },
		{ name: 'Read philosophy', categoryId: catMap.skill, description: 'Current: Meditations' },
		{ name: 'Freelance coding', categoryId: catMap.money, description: 'Client projects' },
		{ name: 'Piano practice', categoryId: catMap.skill, description: 'Scales + repertoire' },
		{ name: 'Meal prep', categoryId: catMap.duty, description: 'Weekly cooking batch' },
		{ name: 'Job applications', categoryId: catMap.money, description: 'Resume + apply' },
		{ name: 'Meditate', categoryId: catMap.duty, description: '20 min vipassana' },
		{ name: 'Write blog post', categoryId: catMap.money, description: 'Technical writing' },
		{ name: 'Clean apartment', categoryId: catMap.duty, description: 'Deep clean rotation' },
		{ name: 'Draw', categoryId: catMap.skill, description: 'Figure drawing practice' },
		{ name: 'Budget review', categoryId: catMap.money, description: 'Monthly finances' }
	];

	const activityIds: Record<string, number> = {};
	for (const a of activityData) {
		const result = db
			.insert(activities)
			.values({ ...a, userId })
			.run();
		activityIds[a.name] = Number(result.lastInsertRowid);
	}
	console.log(`  ✓ Created ${activityData.length} activities`);

	// ── Weekly Slots ────────────────────────────────────────────────────────
	const slotData = [
		// Monday
		{
			weekday: 0,
			startTime: '06:30',
			durationMinutes: 20,
			mode: 'activity' as const,
			activityId: activityIds['Meditate'],
			label: ''
		},
		{
			weekday: 0,
			startTime: '07:00',
			durationMinutes: 90,
			mode: 'activity' as const,
			activityId: activityIds['Gym'],
			label: ''
		},
		{
			weekday: 0,
			startTime: '09:00',
			durationMinutes: 120,
			mode: 'category' as const,
			categoryId: catMap.money,
			label: ''
		},
		{
			weekday: 0,
			startTime: '14:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Learn Russian'],
			label: ''
		},
		{
			weekday: 0,
			startTime: '19:00',
			durationMinutes: 45,
			mode: 'activity' as const,
			activityId: activityIds['Piano practice'],
			label: ''
		},
		// Tuesday
		{
			weekday: 1,
			startTime: '06:30',
			durationMinutes: 20,
			mode: 'activity' as const,
			activityId: activityIds['Meditate'],
			label: ''
		},
		{
			weekday: 1,
			startTime: '09:00',
			durationMinutes: 180,
			mode: 'activity' as const,
			activityId: activityIds['Freelance coding'],
			label: ''
		},
		{
			weekday: 1,
			startTime: '14:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Read philosophy'],
			label: ''
		},
		{
			weekday: 1,
			startTime: '16:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Draw'],
			label: ''
		},
		// Wednesday
		{
			weekday: 2,
			startTime: '06:30',
			durationMinutes: 20,
			mode: 'activity' as const,
			activityId: activityIds['Meditate'],
			label: ''
		},
		{
			weekday: 2,
			startTime: '07:00',
			durationMinutes: 90,
			mode: 'activity' as const,
			activityId: activityIds['Gym'],
			label: ''
		},
		{
			weekday: 2,
			startTime: '09:00',
			durationMinutes: 120,
			mode: 'category' as const,
			categoryId: catMap.money,
			label: ''
		},
		{
			weekday: 2,
			startTime: '14:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Learn Russian'],
			label: ''
		},
		// Thursday
		{
			weekday: 3,
			startTime: '06:30',
			durationMinutes: 20,
			mode: 'activity' as const,
			activityId: activityIds['Meditate'],
			label: ''
		},
		{
			weekday: 3,
			startTime: '09:00',
			durationMinutes: 180,
			mode: 'activity' as const,
			activityId: activityIds['Freelance coding'],
			label: ''
		},
		{
			weekday: 3,
			startTime: '15:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Write blog post'],
			label: ''
		},
		// Friday
		{
			weekday: 4,
			startTime: '07:00',
			durationMinutes: 90,
			mode: 'activity' as const,
			activityId: activityIds['Gym'],
			label: ''
		},
		{
			weekday: 4,
			startTime: '09:00',
			durationMinutes: 120,
			mode: 'category' as const,
			categoryId: catMap.money,
			label: ''
		},
		{
			weekday: 4,
			startTime: '14:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Learn Russian'],
			label: ''
		},
		{
			weekday: 4,
			startTime: '18:00',
			durationMinutes: 120,
			mode: 'activity' as const,
			activityId: activityIds['Meal prep'],
			label: ''
		},
		// Saturday
		{
			weekday: 5,
			startTime: '08:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Clean apartment'],
			label: ''
		},
		{
			weekday: 5,
			startTime: '10:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Budget review'],
			label: ''
		},
		{
			weekday: 5,
			startTime: '14:00',
			durationMinutes: 120,
			mode: 'category' as const,
			categoryId: catMap.skill,
			label: ''
		},
		// Sunday
		{
			weekday: 6,
			startTime: '09:00',
			durationMinutes: 60,
			mode: 'activity' as const,
			activityId: activityIds['Read philosophy'],
			label: ''
		},
		{
			weekday: 6,
			startTime: '14:00',
			durationMinutes: 90,
			mode: 'activity' as const,
			activityId: activityIds['Piano practice'],
			label: ''
		}
	];

	const slotIds: number[] = [];
	for (const s of slotData) {
		const result = db
			.insert(weeklySlots)
			.values({
				...s,
				userId,
				categoryId: s.categoryId ?? null,
				activityId: s.activityId ?? null
			})
			.run();
		slotIds.push(Number(result.lastInsertRowid));
	}
	console.log(`  ✓ Created ${slotData.length} weekly slots`);

	// ── Tags ────────────────────────────────────────────────────────────────
	const tagNames = [
		'self-worth',
		'productivity',
		'relationships',
		'fear',
		'growth',
		'childhood',
		'work',
		'identity',
		'body-image',
		'money-mindset',
		'perfectionism',
		'vulnerability',
		'creativity',
		'discipline',
		'loneliness'
	];
	const tagIds: Record<string, number> = {};
	for (const name of tagNames) {
		const result = db.insert(tags).values({ name, userId }).run();
		tagIds[name] = Number(result.lastInsertRowid);
	}
	console.log(`  ✓ Created ${tagNames.length} tags`);

	// ── Habits ──────────────────────────────────────────────────────────────
	const habitData = [
		{
			name: 'Doom scrolling',
			description: 'Mindless social media browsing',
			type: 'bad' as const,
			scheduledDays: ''
		},
		{
			name: 'Late night snacking',
			description: 'Eating after 9pm',
			type: 'bad' as const,
			scheduledDays: ''
		},
		{
			name: 'Skipping meditation',
			description: 'Missing morning sit',
			type: 'bad' as const,
			scheduledDays: ''
		},
		{
			name: 'Procrastinating hard tasks',
			description: 'Avoiding important work for easy tasks',
			type: 'bad' as const,
			scheduledDays: ''
		},
		{
			name: 'Cold shower',
			description: 'Morning cold exposure',
			type: 'good' as const,
			scheduledDays: '0,1,2,3,4'
		},
		{
			name: 'Journal before bed',
			description: 'Evening reflection writing',
			type: 'good' as const,
			scheduledDays: ''
		},
		{
			name: 'No caffeine after 2pm',
			description: 'Sleep hygiene',
			type: 'good' as const,
			scheduledDays: ''
		},
		{
			name: 'Walk 30 min',
			description: 'Daily walk outside',
			type: 'good' as const,
			scheduledDays: ''
		}
	];

	const habitIds: Record<string, number> = {};
	for (const h of habitData) {
		const result = db
			.insert(habits)
			.values({ ...h, userId })
			.run();
		habitIds[h.name] = Number(result.lastInsertRowid);
	}
	console.log(`  ✓ Created ${habitData.length} habits`);

	// Seed some habit occurrences
	const habitOccData = [
		// Doom scrolling — relapsed a few times
		{ habitId: habitIds['Doom scrolling'], date: daysAgo(12), notes: '' },
		{ habitId: habitIds['Doom scrolling'], date: daysAgo(5), notes: '' },
		{ habitId: habitIds['Doom scrolling'], date: daysAgo(1), notes: '' },
		// Late night snacking
		{ habitId: habitIds['Late night snacking'], date: daysAgo(20), notes: '' },
		{ habitId: habitIds['Late night snacking'], date: daysAgo(8), notes: '' },
		// Cold shower streaks
		...Array.from({ length: 14 }, (_, i) => ({
			habitId: habitIds['Cold shower'],
			date: daysAgo(i),
			notes: ''
		})),
		// Journal before bed
		...Array.from({ length: 10 }, (_, i) => ({
			habitId: habitIds['Journal before bed'],
			date: daysAgo(i),
			notes: ''
		})),
		// Walk 30 min
		...Array.from({ length: 7 }, (_, i) => ({
			habitId: habitIds['Walk 30 min'],
			date: daysAgo(i * 2),
			notes: ''
		}))
	];

	for (const o of habitOccData) {
		db.insert(habitOccurrences).values(o).run();
	}
	console.log(`  ✓ Created ${habitOccData.length} habit occurrences`);

	// ── Diary Entries ───────────────────────────────────────────────────────
	const diaryData = [
		{
			content:
				'Good morning session. Gym felt strong today, hit a PR on deadlift. Meditation was shaky — mind kept racing about the freelance deadline.',
			daysAgo: 1,
			tagNames: ['productivity', 'discipline']
		},
		{
			content:
				'Realized I have been avoiding the hard conversation with my client. Fear of conflict is deeply rooted. Need to just send the email.',
			daysAgo: 3,
			tagNames: ['fear', 'work', 'vulnerability']
		},
		{
			content:
				'Piano practice was magical today. Got lost in a Chopin nocturne for an hour. These flow states remind me why I do this.',
			daysAgo: 5,
			tagNames: ['creativity', 'growth']
		},
		{
			content:
				'Caught myself doom scrolling for 45 minutes after lunch. The trigger was boredom during a break between tasks. Need a better transition ritual.',
			daysAgo: 7,
			tagNames: ['productivity', 'discipline']
		},
		{
			content:
				'Russian lesson went well. Starting to think in simple Russian sentences spontaneously. Language acquisition is nonlinear — months of nothing then sudden leaps.',
			daysAgo: 10,
			tagNames: ['growth']
		},
		{
			content:
				'Feeling isolated today. Everyone seems to have their thing figured out. I know comparison is the thief of joy but the feeling persists.',
			daysAgo: 14,
			tagNames: ['loneliness', 'self-worth', 'identity']
		},
		{
			content:
				'Read about Stoic acceptance in Meditations. The obstacle is the way. Trying to apply this to the freelance project delays.',
			daysAgo: 18,
			tagNames: ['growth', 'work']
		},
		{
			content:
				'Budget review day. Spending is under control. The anxiety about money is disproportionate to reality. Old pattern.',
			daysAgo: 21,
			tagNames: ['money-mindset', 'fear']
		}
	];

	for (const d of diaryData) {
		const result = db
			.insert(diaryEntries)
			.values({
				content: d.content,
				userId,
				createdAt: datetimeDaysAgo(d.daysAgo, 21, 30),
				updatedAt: datetimeDaysAgo(d.daysAgo, 21, 30)
			})
			.run();
		const entryId = Number(result.lastInsertRowid);

		for (const tn of d.tagNames) {
			if (tagIds[tn]) {
				db.insert(diaryEntryTags).values({ entryId, tagId: tagIds[tn] }).run();
			}
		}
	}
	console.log(`  ✓ Created ${diaryData.length} diary entries with tags`);

	// ── Task Instances (some historical) ────────────────────────────────────
	// Generate a few task instances for the last couple of days
	const taskData = [
		{ slotIdx: 0, daysAgo: 1, hour: 6, min: 30, status: 'completed' as const },
		{ slotIdx: 1, daysAgo: 1, hour: 7, min: 0, status: 'completed' as const },
		{ slotIdx: 2, daysAgo: 1, hour: 9, min: 0, status: 'completed' as const },
		{ slotIdx: 3, daysAgo: 1, hour: 14, min: 0, status: 'delayed' as const },
		{ slotIdx: 4, daysAgo: 1, hour: 19, min: 0, status: 'skipped' as const }
	];

	for (const t of taskData) {
		if (slotIds[t.slotIdx]) {
			db.insert(taskInstances)
				.values({
					slotId: slotIds[t.slotIdx],
					scheduledAt: datetimeDaysAgo(t.daysAgo, t.hour, t.min),
					status: t.status,
					userId,
					completedAt:
						t.status === 'completed' || t.status === 'delayed'
							? datetimeDaysAgo(t.daysAgo, t.hour + 1, t.min)
							: null
				})
				.run();
		}
	}
	console.log(`  ✓ Created ${taskData.length} task instances`);

	console.log('\n✓ Dev seed complete!');
	console.log(`  User: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
	console.log(`  Habits: ${habitData.length}`);
	console.log(`  Activities: ${activityData.length}`);
	console.log(`  Weekly Slots: ${slotData.length}`);
	console.log(`  Diary Entries: ${diaryData.length}`);

	client.close();
}

seed().catch((err) => {
	console.error('Dev seed failed:', err);
	process.exit(1);
});
