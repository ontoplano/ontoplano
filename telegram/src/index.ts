import { Bot, GrammyError, HttpError } from 'grammy';
import { registerListCommands } from './commands/list.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerGridCommand } from './commands/grid.js';
import { registerActivitiesCommand } from './commands/activities.js';
import { registerTodoCommand } from './commands/todo.js';
import { registerDiaryCommand } from './commands/diary.js';
import { registerIdeiaCommand } from './commands/ideia.js';
import { COMMANDS, registerHelpCommand } from './commands/help.js';

/**
 * The bot is for a self-hosted instance, and only for one.
 *
 * It opens the database file directly and acts as whoever the instance belongs
 * to; on a shared instance that would be one Telegram account holding the keys
 * to everybody's data. So it refuses to start unless the deployment says it is
 * self-hosted — the same gate as deployment settings in the UI, and where
 * billing will sit.
 *
 * `TELEGRAM_ALLOWED_USER` is the numeric Telegram id allowed to talk to it.
 */
if (process.env.ONTOPLANO_SELF_HOST !== 'true') {
	throw new Error(
		'The Telegram bot runs on self-hosted instances only. Set ONTOPLANO_SELF_HOST=true ' +
			'in ~/.config/ontoplano/env if this machine is yours alone.'
	);
}

const allowedUser = Number(process.env.TELEGRAM_ALLOWED_USER);
if (!Number.isFinite(allowedUser) || allowedUser <= 0) {
	throw new Error(
		'TELEGRAM_ALLOWED_USER not set. It is your numeric Telegram id — the bot answers ' +
			'nobody else, because it speaks for the whole instance.'
	);
}

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
	throw new Error('TELEGRAM_BOT_TOKEN not set');
}

const bot = new Bot(token);

bot.use(async (ctx, next) => {
	if (ctx.from?.id !== allowedUser) return;
	await next();
});

registerListCommands(bot);
registerPlanCommand(bot);
registerGridCommand(bot);
registerActivitiesCommand(bot);
registerTodoCommand(bot);
registerDiaryCommand(bot);
registerIdeiaCommand(bot);
registerHelpCommand(bot);

bot.catch((error) => {
	const { ctx } = error;
	console.error(`Telegram update error for update ${ctx.update.update_id}`);

	if (error.error instanceof GrammyError) {
		console.error('Grammy error:', error.error.description);
		return;
	}

	if (error.error instanceof HttpError) {
		console.error('Telegram HTTP error:', error.error);
		return;
	}

	console.error('Unknown Telegram bot error:', error.error);
});

// Keeps Telegram's own command menu in sync with /help.
bot.api
	.setMyCommands(COMMANDS.map(({ command, description }) => ({ command, description })))
	.catch((error: unknown) => console.error('Failed to publish command list:', error));

bot.start();
