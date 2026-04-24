import { eq } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { plannerTodos } from '../../../src/lib/server/db/schema.js';

type PlannerTodo = {
	title: string;
	completed: boolean;
};

async function fetchTodos(): Promise<PlannerTodo[]> {
	const userId = await getPrimaryUserId();

	return db
		.select({
			title: plannerTodos.title,
			completed: plannerTodos.completed
		})
		.from(plannerTodos)
		.where(eq(plannerTodos.userId, userId))
		.orderBy(plannerTodos.completed, plannerTodos.createdAt)
		.all();
}

function formatTodoMessage(todos: PlannerTodo[]): string {
	if (todos.length === 0) {
		return '📝 Todo List\n\nNo planner todos yet.';
	}

	const active = todos.filter((todo) => !todo.completed).length;
	const done = todos.length - active;
	const lines = ['📝 Todo List', '', ...todos.map((todo) => `${todo.completed ? '✅' : '❌'} ${todo.title}`), '', `Active: ${active} | Done: ${done}`];

	return lines.join('\n');
}

export function registerTodoCommand(bot: Bot<Context>): void {
	bot.command('todo', async (ctx) => {
		const todos = await fetchTodos();
		await ctx.reply(formatTodoMessage(todos));
	});
}
