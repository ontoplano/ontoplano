import { and, desc, eq } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { shoppingItems } from '../../../src/lib/server/db/schema.js';

type ShoppingItem = {
	name: string;
	type: 'replenish' | 'someday';
	bought: boolean;
	snoozed: boolean;
};

function groupItems(items: ShoppingItem[]): { replenish: ShoppingItem[]; someday: ShoppingItem[] } {
	return {
		replenish: items.filter((item) => item.type === 'replenish'),
		someday: items.filter((item) => item.type === 'someday')
	};
}

function formatSection(
	title: string,
	items: ShoppingItem[],
	formatter: (item: ShoppingItem) => string
): string[] {
	if (items.length === 0) return [];

	return [title, ...items.map(formatter)];
}

function formatListMessage(items: ShoppingItem[]): string {
	if (items.length === 0) {
		return '🛒 Shopping List\n\nNo shopping items yet.';
	}

	const grouped = groupItems(items);
	const sections = [
		...formatSection('📦 Replenish', grouped.replenish, (item) => `${item.bought ? '✅' : '❌'} ${item.name}`),
		'',
		...formatSection('💫 Wishlist', grouped.someday, (item) => `${item.bought ? '✅' : '❌'} ${item.name}`)
	].filter((line, index, array) => !(line === '' && (index === 0 || array[index - 1] === '')));

	return `🛒 Shopping List\n\n${sections.join('\n')}`;
}

function formatMissingMessage(items: ShoppingItem[]): string {
	if (items.length === 0) {
		return '🛒 Missing Items\n\nNothing missing right now.';
	}

	const grouped = groupItems(items);
	const sections = [
		...formatSection('📦 Replenish', grouped.replenish, (item) => `• ${item.name}`),
		'',
		...formatSection('💫 Wishlist', grouped.someday, (item) => `• ${item.name}`)
	].filter((line, index, array) => !(line === '' && (index === 0 || array[index - 1] === '')));

	return `🛒 Missing Items\n\n${sections.join('\n')}`;
}

async function fetchShoppingItems(onlyMissing: boolean): Promise<ShoppingItem[]> {
	const userId = await getPrimaryUserId();

	const conditions = [eq(shoppingItems.userId, userId)];

	if (onlyMissing) {
		conditions.push(eq(shoppingItems.bought, false), eq(shoppingItems.snoozed, false));
	}

	return db
		.select({
			name: shoppingItems.name,
			type: shoppingItems.type,
			bought: shoppingItems.bought,
			snoozed: shoppingItems.snoozed
		})
		.from(shoppingItems)
		.where(and(...conditions))
		.orderBy(shoppingItems.type, shoppingItems.bought, desc(shoppingItems.createdAt))
		.all();
}

export function registerListCommands(bot: Bot<Context>): void {
	bot.command('list', async (ctx) => {
		const items = await fetchShoppingItems(false);
		await ctx.reply(formatListMessage(items));
	});

	bot.command('missing', async (ctx) => {
		const items = await fetchShoppingItems(true);
		await ctx.reply(formatMissingMessage(items));
	});
}
