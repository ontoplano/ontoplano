import { Bot, GrammyError, HttpError } from 'grammy';
import { registerListCommands } from './commands/list.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerTodoCommand } from './commands/todo.js';
import { registerDiaryCommand } from './commands/diary.js';

const ALLOWED_USER = 123456789;
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
	throw new Error('TELEGRAM_BOT_TOKEN not set');
}

const bot = new Bot(token);

bot.use(async (ctx, next) => {
	if (ctx.from?.id !== ALLOWED_USER) return;
	await next();
});

registerListCommands(bot);
registerPlanCommand(bot);
registerTodoCommand(bot);
registerDiaryCommand(bot);

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

bot.start();
