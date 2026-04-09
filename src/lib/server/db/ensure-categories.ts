import { db } from './index.js';
import { categories } from './schema.js';
import { eq } from 'drizzle-orm';

const DEFAULT_CATEGORIES = [
	{ name: 'duty', color: '#3b82f6', colorLight: '#dbeafe' },
	{ name: 'skill', color: '#22c55e', colorLight: '#dcfce7' },
	{ name: 'money', color: '#f59e0b', colorLight: '#fef3c7' }
];

export function ensureUserCategories(userId: string): void {
	const existing = db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.userId, userId))
		.limit(1)
		.get();

	if (existing) return;

	for (const cat of DEFAULT_CATEGORIES) {
		db.insert(categories)
			.values({ userId, name: cat.name, color: cat.color, colorLight: cat.colorLight })
			.run();
	}
}
