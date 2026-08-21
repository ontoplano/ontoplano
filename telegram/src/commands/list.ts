import { and, desc, eq } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { shoppingItems, shoppingCategories } from '../../../src/lib/server/db/schema.js';

type InventoryItem = {
	name: string;
	bought: boolean;
	categoryName: string | null;
	categorySortOrder: number | null;
};

type WishlistItem = {
	name: string;
	bought: boolean;
};

function groupByCategory(items: InventoryItem[]): { name: string; items: InventoryItem[] }[] {
	const grouped = new Map<string, InventoryItem[]>();
	for (const item of items) {
		const cat = item.categoryName ?? 'Other';
		if (!grouped.has(cat)) grouped.set(cat, []);
		grouped.get(cat)!.push(item);
	}
	return [...grouped.entries()]
		.sort((a, b) => {
			const aOrder = a[1][0]?.categorySortOrder ?? 999;
			const bOrder = b[1][0]?.categorySortOrder ?? 999;
			return aOrder - bOrder;
		})
		.map(([name, items]) => ({ name, items }));
}

function formatListMessage(items: InventoryItem[]): string {
	if (items.length === 0) {
		return '📦 Inventory\n\nNo inventory items yet.';
	}

	const groups = groupByCategory(items);
	const lines: string[] = ['📦 Inventory', ''];

	for (const group of groups) {
		lines.push(`▸ ${group.name}`);
		for (const item of group.items) {
			lines.push(`  ${item.bought ? '✅' : '❌'} ${item.name}`);
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd();
}

function formatMissingMessage(items: InventoryItem[]): string {
	if (items.length === 0) {
		return '📦 Missing Items\n\nNothing missing right now.';
	}

	const groups = groupByCategory(items);
	const lines: string[] = ['📦 Missing Items', ''];
	let counter = 1;

	for (const group of groups) {
		lines.push(`▸ ${group.name}`);
		for (const item of group.items) {
			lines.push(`  ${counter}. ${item.name}`);
			counter++;
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd();
}

function formatWishlistMessage(items: WishlistItem[]): string {
	if (items.length === 0) {
		return '💫 Wishlist\n\nNo wishlist items yet.';
	}

	const lines = [
		'💫 Wishlist',
		'',
		...items.map((item) => `${item.bought ? '✅' : '❌'} ${item.name}`)
	];
	return lines.join('\n');
}

async function fetchInventory(onlyMissing: boolean): Promise<InventoryItem[]> {
	const userId = await getPrimaryUserId();

	const conditions = [eq(shoppingItems.userId, userId), eq(shoppingItems.type, 'replenish')];

	if (onlyMissing) {
		conditions.push(eq(shoppingItems.bought, false), eq(shoppingItems.snoozed, false));
	}

	return db
		.select({
			name: shoppingItems.name,
			bought: shoppingItems.bought,
			categoryName: shoppingCategories.name,
			categorySortOrder: shoppingCategories.sortOrder
		})
		.from(shoppingItems)
		.leftJoin(shoppingCategories, eq(shoppingItems.shoppingCategoryId, shoppingCategories.id))
		.where(and(...conditions))
		.orderBy(shoppingCategories.sortOrder, shoppingItems.bought, desc(shoppingItems.createdAt))
		.all();
}

async function fetchWishlist(): Promise<WishlistItem[]> {
	const userId = await getPrimaryUserId();

	return db
		.select({
			name: shoppingItems.name,
			bought: shoppingItems.bought
		})
		.from(shoppingItems)
		.where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.type, 'someday')))
		.orderBy(shoppingItems.bought, desc(shoppingItems.createdAt))
		.all();
}

export function registerListCommands(bot: Bot<Context>): void {
	bot.command('list', async (ctx) => {
		const items = await fetchInventory(false);
		await ctx.reply(formatListMessage(items));
	});

	bot.command('missing', async (ctx) => {
		const items = await fetchInventory(true);
		await ctx.reply(formatMissingMessage(items));
	});

	bot.command('wishlist', async (ctx) => {
		const items = await fetchWishlist();
		await ctx.reply(formatWishlistMessage(items));
	});
}
