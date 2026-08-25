import { db } from './index.js';
import { categories } from './schema.js';
import { eq } from 'drizzle-orm';

/**
 * What a brand-new account starts with.
 *
 * Not `duty / skill / money`: that is the author's ontology and means nothing
 * to a stranger. These are renameable like any other category — they exist so
 * the first block someone drags has somewhere to go.
 */
const DEFAULT_CATEGORIES = [
	{ name: 'work', color: '#1d4ed8', colorLight: '#dbeafe' },
	{ name: 'health', color: '#0f766e', colorLight: '#ccfbf1' },
	{ name: 'personal', color: '#b45309', colorLight: '#fef3c7' }
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
