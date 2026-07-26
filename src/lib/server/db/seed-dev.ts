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
	habitOccurrences,
	beliefs,
	beliefRelations,
	evidence,
	beliefEvidence,
	beliefIntensities,
	beliefHabits,
	beliefTags
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

	// ── Beliefs (30+) ───────────────────────────────────────────────────────
	// Organized in thematic clusters that form an interconnected graph
	const beliefData: Array<{
		content: string;
		valence: 'positive' | 'negative' | null;
		tagNames: string[];
	}> = [
		// Self-worth cluster
		{
			content: 'I am fundamentally not good enough as I am',
			valence: 'negative',
			tagNames: ['self-worth', 'childhood']
		},
		{
			content: 'My worth depends on my productivity',
			valence: 'negative',
			tagNames: ['self-worth', 'productivity']
		},
		{
			content: 'I deserve rest and enjoyment without earning it first',
			valence: 'positive',
			tagNames: ['self-worth', 'growth']
		},
		{
			content: 'People will reject me if they see the real me',
			valence: 'negative',
			tagNames: ['self-worth', 'vulnerability', 'relationships']
		},
		{
			content: 'I can be loved even with my flaws',
			valence: 'positive',
			tagNames: ['self-worth', 'vulnerability']
		},

		// Perfectionism cluster
		{
			content: 'If I cannot do something perfectly, it is not worth doing',
			valence: 'negative',
			tagNames: ['perfectionism', 'fear']
		},
		{
			content: 'Making mistakes is how I learn and grow',
			valence: 'positive',
			tagNames: ['perfectionism', 'growth']
		},
		{
			content: 'Good enough is better than perfect and unfinished',
			valence: 'positive',
			tagNames: ['perfectionism', 'productivity']
		},
		{
			content: 'Others will judge me harshly for any mistake',
			valence: 'negative',
			tagNames: ['perfectionism', 'fear', 'relationships']
		},

		// Fear and avoidance cluster
		{
			content: 'Conflict always leads to abandonment',
			valence: 'negative',
			tagNames: ['fear', 'relationships', 'childhood']
		},
		{
			content: 'If I express anger, I will lose control',
			valence: 'negative',
			tagNames: ['fear', 'vulnerability']
		},
		{
			content: 'Discomfort is dangerous and must be avoided',
			valence: 'negative',
			tagNames: ['fear', 'growth']
		},
		{
			content: 'I can handle difficult emotions without being destroyed',
			valence: 'positive',
			tagNames: ['fear', 'growth', 'vulnerability']
		},

		// Money and scarcity cluster
		{
			content: 'There will never be enough money no matter how much I earn',
			valence: 'negative',
			tagNames: ['money-mindset', 'fear']
		},
		{
			content: 'Asking for what I am worth is greedy',
			valence: 'negative',
			tagNames: ['money-mindset', 'self-worth']
		},
		{
			content: 'I can create financial security through consistent effort',
			valence: 'positive',
			tagNames: ['money-mindset', 'growth']
		},
		{
			content: 'Rich people are selfish and I do not want to be like them',
			valence: 'negative',
			tagNames: ['money-mindset', 'identity']
		},

		// Body and discipline cluster
		{
			content: 'My body is a tool to be optimized, not a home to live in',
			valence: 'negative',
			tagNames: ['body-image', 'perfectionism']
		},
		{
			content: 'If I skip one workout, my progress resets to zero',
			valence: 'negative',
			tagNames: ['body-image', 'perfectionism', 'discipline']
		},
		{
			content: 'Consistent imperfect action beats sporadic perfect effort',
			valence: 'positive',
			tagNames: ['discipline', 'growth']
		},
		{
			content: 'My body deserves care, not punishment',
			valence: 'positive',
			tagNames: ['body-image', 'self-worth']
		},

		// Identity and belonging cluster
		{
			content: 'I am too different to truly belong anywhere',
			valence: 'negative',
			tagNames: ['identity', 'loneliness']
		},
		{
			content: 'Being alone means something is wrong with me',
			valence: 'negative',
			tagNames: ['loneliness', 'self-worth']
		},
		{
			content: 'Solitude can be nourishing, not just isolating',
			valence: 'positive',
			tagNames: ['loneliness', 'growth']
		},
		{
			content: 'I do not need to have everything figured out to be valid',
			valence: 'positive',
			tagNames: ['identity', 'self-worth', 'growth']
		},

		// Creativity cluster
		{
			content: 'Creative work is only valid if it produces income',
			valence: 'negative',
			tagNames: ['creativity', 'money-mindset']
		},
		{
			content: 'Play and exploration have inherent value',
			valence: 'positive',
			tagNames: ['creativity', 'growth']
		},
		{
			content: 'I lost my creative spark and cannot get it back',
			valence: 'negative',
			tagNames: ['creativity', 'fear', 'identity']
		},
		{
			content: 'Creativity flows when I stop trying to force it',
			valence: 'positive',
			tagNames: ['creativity', 'discipline']
		},

		// Work and achievement cluster
		{
			content: 'I will be happy when I finally achieve X',
			valence: 'negative',
			tagNames: ['work', 'self-worth', 'productivity']
		},
		{
			content: 'If I rest, others will overtake me',
			valence: 'negative',
			tagNames: ['work', 'fear', 'productivity']
		},
		{
			content: 'The process matters more than the outcome',
			valence: 'positive',
			tagNames: ['work', 'growth', 'discipline']
		},
		{
			content: 'Sustainable pace is faster than burnout cycles',
			valence: 'positive',
			tagNames: ['work', 'discipline', 'productivity']
		},

		// Relationship patterns
		{
			content: 'Showing need makes me a burden',
			valence: 'negative',
			tagNames: ['relationships', 'vulnerability', 'self-worth']
		},
		{
			content: 'Healthy relationships require mutual vulnerability',
			valence: 'positive',
			tagNames: ['relationships', 'vulnerability', 'growth']
		},
		{
			content: 'I attract the same dysfunctional patterns over and over',
			valence: 'negative',
			tagNames: ['relationships', 'childhood', 'identity']
		}
	];

	const beliefIds: number[] = [];
	for (const b of beliefData) {
		const result = db
			.insert(beliefs)
			.values({
				content: b.content,
				valence: b.valence,
				userId,
				createdAt: datetimeDaysAgo(Math.floor(Math.random() * 60) + 5),
				updatedAt: datetimeDaysAgo(Math.floor(Math.random() * 5))
			})
			.run();
		const beliefId = Number(result.lastInsertRowid);
		beliefIds.push(beliefId);

		// Link tags
		for (const tn of b.tagNames) {
			if (tagIds[tn]) {
				db.insert(beliefTags).values({ beliefId, tagId: tagIds[tn] }).run();
			}
		}
	}
	console.log(`  ✓ Created ${beliefData.length} beliefs with tags`);

	// ── Belief Relations ────────────────────────────────────────────────────
	// Build a connected graph: contradictions between opposing beliefs, supports between aligned ones
	const relationData: Array<{ source: number; target: number; type: 'supports' | 'contradicts' }> =
		[
			// Self-worth: "not good enough" ←contradicts→ "deserve rest"
			{ source: 0, target: 2, type: 'contradicts' },
			// "worth depends on productivity" supports "not good enough"
			{ source: 1, target: 0, type: 'supports' },
			// "people will reject me" supports "not good enough"
			{ source: 3, target: 0, type: 'supports' },
			// "can be loved with flaws" contradicts "people will reject me"
			{ source: 4, target: 3, type: 'contradicts' },
			// Perfectionism: "not worth doing if not perfect" supports "worth depends on productivity"
			{ source: 5, target: 1, type: 'supports' },
			// "making mistakes is learning" contradicts "not worth doing if not perfect"
			{ source: 6, target: 5, type: 'contradicts' },
			// "good enough > perfect" contradicts "not worth doing if not perfect"
			{ source: 7, target: 5, type: 'contradicts' },
			// "others will judge" supports "not worth doing if not perfect"
			{ source: 8, target: 5, type: 'supports' },
			// "others will judge" supports "people will reject me"
			{ source: 8, target: 3, type: 'supports' },
			// Fear: "conflict → abandonment" supports "people will reject me"
			{ source: 9, target: 3, type: 'supports' },
			// "discomfort is dangerous" supports "conflict → abandonment"
			{ source: 11, target: 9, type: 'supports' },
			// "I can handle difficult emotions" contradicts "discomfort is dangerous"
			{ source: 12, target: 11, type: 'contradicts' },
			// Money: "never enough" supports "not good enough"
			{ source: 13, target: 0, type: 'supports' },
			// "asking for worth is greedy" supports "never enough"
			{ source: 14, target: 13, type: 'supports' },
			// "can create financial security" contradicts "never enough"
			{ source: 15, target: 13, type: 'contradicts' },
			// Body: "skip one workout → reset" supports "not worth doing if not perfect"
			{ source: 18, target: 5, type: 'supports' },
			// "consistent imperfect > sporadic perfect" contradicts "skip one workout → reset"
			{ source: 19, target: 18, type: 'contradicts' },
			// "body deserves care" contradicts "body is tool to optimize"
			{ source: 20, target: 17, type: 'contradicts' },
			// Identity: "too different to belong" supports "being alone = wrong with me"
			{ source: 21, target: 22, type: 'supports' },
			// "solitude can be nourishing" contradicts "being alone = wrong with me"
			{ source: 23, target: 22, type: 'contradicts' },
			// "don't need everything figured out" contradicts "not good enough"
			{ source: 24, target: 0, type: 'contradicts' },
			// Creativity: "only valid if income" supports "worth depends on productivity"
			{ source: 25, target: 1, type: 'supports' },
			// "play has value" contradicts "only valid if income"
			{ source: 26, target: 25, type: 'contradicts' },
			// "lost creative spark" supports "I am fundamentally not good enough"
			{ source: 27, target: 0, type: 'supports' },
			// "creativity flows when not forced" contradicts "lost creative spark"
			{ source: 28, target: 27, type: 'contradicts' },
			// Work: "happy when achieve X" supports "worth depends on productivity"
			{ source: 29, target: 1, type: 'supports' },
			// "if I rest, others overtake me" supports "happy when achieve X"
			{ source: 30, target: 29, type: 'supports' },
			// "process > outcome" contradicts "happy when achieve X"
			{ source: 31, target: 29, type: 'contradicts' },
			// "sustainable pace > burnout" contradicts "if I rest, others overtake me"
			{ source: 32, target: 30, type: 'contradicts' },
			// Relationships: "showing need = burden" supports "people will reject me"
			{ source: 33, target: 3, type: 'supports' },
			// "healthy relationships require vulnerability" contradicts "showing need = burden"
			{ source: 34, target: 33, type: 'contradicts' },
			// "attract same patterns" supports "conflict → abandonment"
			{ source: 35, target: 9, type: 'supports' },
			// Cross-cluster: "discomfort is dangerous" supports "if I express anger I lose control"
			{ source: 11, target: 10, type: 'supports' },
			// "I can handle emotions" contradicts "if I express anger I lose control"
			{ source: 12, target: 10, type: 'contradicts' }
		];

	for (const r of relationData) {
		db.insert(beliefRelations)
			.values({
				sourceBeliefId: beliefIds[r.source],
				targetBeliefId: beliefIds[r.target],
				type: r.type
			})
			.run();
	}
	console.log(`  ✓ Created ${relationData.length} belief relations`);

	// ── Evidence ─────────────────────────────────────────────────────────────
	const evidenceData = [
		{
			content: 'My friend told me she appreciates my honesty even when it is uncomfortable',
			daysAgo: 3,
			beliefLinks: [
				{ beliefIdx: 4, type: 'supports' as const },
				{ beliefIdx: 3, type: 'contradicts' as const }
			]
		},
		{
			content: 'Got positive client feedback despite submitting work I thought was mediocre',
			daysAgo: 7,
			beliefLinks: [
				{ beliefIdx: 7, type: 'supports' as const },
				{ beliefIdx: 5, type: 'contradicts' as const }
			]
		},
		{
			content: 'Missed gym for a week due to illness, came back and lifted the same weights',
			daysAgo: 14,
			beliefLinks: [
				{ beliefIdx: 18, type: 'contradicts' as const },
				{ beliefIdx: 19, type: 'supports' as const }
			]
		},
		{
			content: 'Had a difficult conversation with roommate about noise — he was understanding',
			daysAgo: 10,
			beliefLinks: [
				{ beliefIdx: 9, type: 'contradicts' as const },
				{ beliefIdx: 12, type: 'supports' as const }
			]
		},
		{
			content: 'Received a raise at freelance gig without asking — client valued my work',
			daysAgo: 20,
			beliefLinks: [
				{ beliefIdx: 14, type: 'contradicts' as const },
				{ beliefIdx: 15, type: 'supports' as const }
			]
		},
		{
			content: 'Spent Sunday doing nothing productive and felt genuinely recharged Monday',
			daysAgo: 5,
			beliefLinks: [
				{ beliefIdx: 2, type: 'supports' as const },
				{ beliefIdx: 30, type: 'contradicts' as const }
			]
		},
		{
			content: 'Painted for fun for the first time in months — no pressure — actually enjoyed it',
			daysAgo: 8,
			beliefLinks: [
				{ beliefIdx: 26, type: 'supports' as const },
				{ beliefIdx: 28, type: 'supports' as const }
			]
		},
		{
			content: 'My partner said she fell in love with my weirdness, not despite it',
			daysAgo: 30,
			beliefLinks: [
				{ beliefIdx: 4, type: 'supports' as const },
				{ beliefIdx: 21, type: 'contradicts' as const }
			]
		},
		{
			content: 'Budgeted consistently for 3 months — savings grew without feeling deprived',
			daysAgo: 15,
			beliefLinks: [
				{ beliefIdx: 15, type: 'supports' as const },
				{ beliefIdx: 13, type: 'contradicts' as const }
			]
		},
		{
			content: 'Expressed frustration at work meeting calmly — others agreed and things changed',
			daysAgo: 12,
			beliefLinks: [
				{ beliefIdx: 10, type: 'contradicts' as const },
				{ beliefIdx: 12, type: 'supports' as const }
			]
		},
		{
			content: 'Took 2 weeks off freelancing — came back with better ideas than before',
			daysAgo: 25,
			beliefLinks: [
				{ beliefIdx: 32, type: 'supports' as const },
				{ beliefIdx: 30, type: 'contradicts' as const }
			]
		},
		{
			content: 'Shared an imperfect blog post — got more engagement than my polished ones',
			daysAgo: 18,
			beliefLinks: [
				{ beliefIdx: 7, type: 'supports' as const },
				{ beliefIdx: 8, type: 'contradicts' as const }
			]
		},
		{
			content: 'Cold shower streak: 14 days and counting. Each one gets easier.',
			daysAgo: 1,
			beliefLinks: [
				{ beliefIdx: 19, type: 'supports' as const },
				{ beliefIdx: 11, type: 'contradicts' as const }
			]
		},
		{
			content: 'Told a new friend about my anxiety — they shared theirs too. Connection deepened.',
			daysAgo: 22,
			beliefLinks: [
				{ beliefIdx: 34, type: 'supports' as const },
				{ beliefIdx: 33, type: 'contradicts' as const }
			]
		},
		{
			content: 'Failed a Russian exam but teacher said my improvement rate is remarkable',
			daysAgo: 28,
			beliefLinks: [
				{ beliefIdx: 6, type: 'supports' as const },
				{ beliefIdx: 31, type: 'supports' as const }
			]
		}
	];

	for (const e of evidenceData) {
		const result = db
			.insert(evidence)
			.values({
				content: e.content,
				userId,
				createdAt: datetimeDaysAgo(e.daysAgo)
			})
			.run();
		const evidenceId = Number(result.lastInsertRowid);

		for (const link of e.beliefLinks) {
			db.insert(beliefEvidence)
				.values({
					beliefId: beliefIds[link.beliefIdx],
					evidenceId,
					type: link.type
				})
				.run();
		}
	}
	console.log(`  ✓ Created ${evidenceData.length} evidence items with belief links`);

	// ── Belief Intensities ──────────────────────────────────────────────────
	// Track some beliefs over time to show reconsolidation progress
	const intensityData: Array<{
		beliefIdx: number;
		entries: Array<{ daysAgo: number; value: number; notes: string }>;
	}> = [
		{
			beliefIdx: 0, // "not good enough"
			entries: [
				{ daysAgo: 60, value: 9, notes: 'Very strong during stressful week' },
				{ daysAgo: 45, value: 8, notes: '' },
				{ daysAgo: 30, value: 7, notes: 'Starting to question this' },
				{ daysAgo: 15, value: 6, notes: 'Some days I feel okay about myself' },
				{ daysAgo: 5, value: 5, notes: 'Progress — can catch the thought now' }
			]
		},
		{
			beliefIdx: 5, // "not perfect not worth doing"
			entries: [
				{ daysAgo: 50, value: 8, notes: '' },
				{ daysAgo: 35, value: 7, notes: '' },
				{ daysAgo: 20, value: 5, notes: 'Blog post evidence helped' },
				{ daysAgo: 7, value: 4, notes: 'Submitted imperfect work — world did not end' }
			]
		},
		{
			beliefIdx: 9, // "conflict → abandonment"
			entries: [
				{ daysAgo: 55, value: 9, notes: '' },
				{ daysAgo: 40, value: 8, notes: '' },
				{ daysAgo: 25, value: 7, notes: 'Had a disagreement, still friends' },
				{ daysAgo: 10, value: 6, notes: 'Roommate conversation went well' },
				{ daysAgo: 2, value: 5, notes: '' }
			]
		},
		{
			beliefIdx: 13, // "never enough money"
			entries: [
				{ daysAgo: 45, value: 8, notes: '' },
				{ daysAgo: 30, value: 7, notes: '' },
				{ daysAgo: 15, value: 5, notes: 'Budget proves otherwise' },
				{ daysAgo: 3, value: 4, notes: '' }
			]
		},
		{
			beliefIdx: 12, // "can handle difficult emotions"
			entries: [
				{ daysAgo: 50, value: 3, notes: 'Still learning' },
				{ daysAgo: 35, value: 4, notes: '' },
				{ daysAgo: 20, value: 5, notes: 'Getting better' },
				{ daysAgo: 10, value: 7, notes: 'Handled work conflict well' },
				{ daysAgo: 2, value: 7, notes: '' }
			]
		},
		{
			beliefIdx: 19, // "consistent imperfect action"
			entries: [
				{ daysAgo: 40, value: 4, notes: "Intellectually agree, don't feel it" },
				{ daysAgo: 25, value: 5, notes: '' },
				{ daysAgo: 12, value: 7, notes: 'Gym return after illness proved this' },
				{ daysAgo: 3, value: 8, notes: 'Really starting to internalize this' }
			]
		}
	];

	let intensityCount = 0;
	for (const bi of intensityData) {
		for (const entry of bi.entries) {
			db.insert(beliefIntensities)
				.values({
					beliefId: beliefIds[bi.beliefIdx],
					date: daysAgo(entry.daysAgo),
					value: entry.value,
					notes: entry.notes
				})
				.run();
			intensityCount++;
		}
	}
	console.log(`  ✓ Created ${intensityCount} belief intensity entries`);

	// ── Belief-Habit Links ──────────────────────────────────────────────────
	const beliefHabitLinks = [
		{ beliefIdx: 0, habitName: 'Journal before bed' }, // not good enough → journaling helps
		{ beliefIdx: 11, habitName: 'Cold shower' }, // discomfort is dangerous → cold exposure
		{ beliefIdx: 11, habitName: 'Doom scrolling' }, // discomfort → avoidance via scrolling
		{ beliefIdx: 1, habitName: 'Procrastinating hard tasks' }, // worth = productivity → procrastination
		{ beliefIdx: 18, habitName: 'Skipping meditation' }, // skip one workout → all or nothing
		{ beliefIdx: 19, habitName: 'Walk 30 min' }, // consistent action → daily walks
		{ beliefIdx: 17, habitName: 'Late night snacking' }, // body as tool → punishing eating
		{ beliefIdx: 2, habitName: 'No caffeine after 2pm' } // deserve rest → sleep hygiene
	];

	for (const bh of beliefHabitLinks) {
		db.insert(beliefHabits)
			.values({
				beliefId: beliefIds[bh.beliefIdx],
				habitId: habitIds[bh.habitName]
			})
			.run();
	}
	console.log(`  ✓ Created ${beliefHabitLinks.length} belief-habit links`);

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
	console.log(`  Beliefs: ${beliefData.length}`);
	console.log(`  Relations: ${relationData.length}`);
	console.log(`  Evidence: ${evidenceData.length}`);
	console.log(`  Intensities: ${intensityCount}`);
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
