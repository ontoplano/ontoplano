import { eq, max } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { diaryEntries } from '../../../src/lib/server/db/schema.js';

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

export function registerDiaryCommand(bot: Bot<Context>): void {
	bot.command('diary', async (ctx) => {
		const text = ctx.match?.trim();
		if (!text) {
			await ctx.reply('Usage: /diary <your entry text>');
			return;
		}

		const userId = await getPrimaryUserId();

		const maxSeqRow = db
			.select({ value: max(diaryEntries.seq) })
			.from(diaryEntries)
			.where(eq(diaryEntries.userId, userId))
			.get();
		const seq = (maxSeqRow?.value ?? -1) + 1;
		const now = toLocalISOString(new Date());

		db.insert(diaryEntries)
			.values({ userId, content: text, seq, createdAt: now, updatedAt: now })
			.run();

		await ctx.reply(`📔 Diary entry #${seq} saved.`);
	});
}
