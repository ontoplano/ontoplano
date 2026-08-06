import type { Bot, Context } from 'grammy';

export interface CommandDoc {
	command: string;
	args?: string;
	description: string;
}

// Single source of truth for the bot's command list: /help renders it and
// index.ts publishes it to Telegram via setMyCommands.
export const COMMANDS: CommandDoc[] = [
	{ command: 'plan', description: "Today's schedule with completion status" },
	{ command: 'grid', description: 'Weekly plan overview, grouped by day' },
	{ command: 'activities', description: 'Activities grouped by category' },
	{ command: 'todo', args: '[text]', description: 'List planner todos, or add one' },
	{ command: 'list', description: 'Full shopping inventory by category' },
	{ command: 'missing', description: 'Shopping items you need to buy' },
	{ command: 'wishlist', description: 'Wishlist items with status' },
	{ command: 'diary', args: '<text>', description: 'Save a diary entry' },
	{ command: 'ideia', args: '<text>', description: 'Save an idea' },
	{ command: 'help', description: 'Show this list of commands' }
];

export function formatHelpMessage(commands: CommandDoc[]): string {
	const lines = ['🤖 Commands', ''];

	for (const cmd of commands) {
		const usage = cmd.args ? `/${cmd.command} ${cmd.args}` : `/${cmd.command}`;
		lines.push(`${usage} — ${cmd.description}`);
	}

	return lines.join('\n');
}

export function registerHelpCommand(bot: Bot<Context>): void {
	bot.command('help', async (ctx) => {
		await ctx.reply(formatHelpMessage(COMMANDS));
	});

	bot.command('start', async (ctx) => {
		await ctx.reply(formatHelpMessage(COMMANDS));
	});
}
