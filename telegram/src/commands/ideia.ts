import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { ideas } from '../../../src/lib/server/db/schema.js';

function toLocalISOString(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		d.getFullYear() +
		'-' +
		pad(d.getMonth() + 1) +
		'-' +
		pad(d.getDate()) +
		'T' +
		pad(d.getHours()) +
		':' +
		pad(d.getMinutes()) +
		':' +
		pad(d.getSeconds())
	);
}

export function registerIdeiaCommand(bot: Bot<Context>): void {
	bot.command('ideia', async (ctx) => {
		const text = ctx.match?.trim();
		if (!text) {
			await ctx.reply('Usage: /ideia <your idea text>');
			return;
		}

		const userId = await getPrimaryUserId();
		const now = toLocalISOString(new Date());

		db.insert(ideas).values({ userId, content: text, createdAt: now, updatedAt: now }).run();

		await ctx.reply(`💡 Idea saved.`);
	});
}
