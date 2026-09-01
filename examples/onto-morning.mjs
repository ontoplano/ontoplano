/**
 * onto-morning — today, pushed to you before you open anything.
 *
 * The second reference ontoplano plugin, and deliberately the simplest one
 * there is: one scoped token, one GET, one message. If you want to see what
 * writing against this API looks like before you write anything, read this
 * rather than `onto-household.mjs` — that one is a two-way sync with webhooks
 * and signatures, and it is not where to start.
 *
 * A planner only helps on the days you open it. This is the other direction:
 * at whatever hour you choose, it reads today and sends it — your blocks, the
 * habits due, what is still owed from an earlier day — to Telegram, to ntfy, or
 * to anything that takes a POST.
 *
 * Setup:
 *   1. Settings → Integrations → new API token, with ONLY
 *      "See what today looks like" (`today:read`). That is the whole scope it
 *      needs, and a token that can do no more is a token you can put in a cron
 *      file without thinking about it.
 *
 *   2. Run it, once a morning:
 *
 *        ONTO_URL=https://app.ontoplano.com ONTO_TOKEN=onto_… \
 *        NTFY_TOPIC=https://ntfy.sh/my-secret-topic \
 *        node onto-morning.mjs
 *
 *      or with Telegram:
 *
 *        ONTO_URL=… ONTO_TOKEN=… \
 *        TELEGRAM_TOKEN=123:abc TELEGRAM_CHAT=456789 \
 *        node onto-morning.mjs
 *
 *      or with neither, which prints it and is how to try it:
 *
 *        ONTO_URL=… ONTO_TOKEN=… node onto-morning.mjs
 *
 *   3. A crontab line, which is the whole scheduler:
 *
 *        0 7 * * *  ONTO_URL=… ONTO_TOKEN=… NTFY_TOPIC=… node /path/onto-morning.mjs
 *
 * No dependencies, no server, nothing running the other twenty-three hours.
 */

const url = (process.env.ONTO_URL ?? '').replace(/\/$/, '');
const token = process.env.ONTO_TOKEN ?? '';

if (!url || !token) {
	console.error('Set ONTO_URL and ONTO_TOKEN.');
	console.error('The token needs one scope: "See what today looks like" (today:read).');
	process.exit(1);
}

/**
 * Today, from the instance.
 *
 * `/api/v1/today` rather than `/schedule/upcoming`: this asks "what does today
 * look like", which is a smaller question and a smaller scope. A token sitting
 * in a cron file should not also be able to read a week ahead.
 */
async function today() {
	const response = await fetch(`${url}/api/v1/today`, {
		headers: { authorization: `Bearer ${token}` }
	});

	if (response.status === 401 || response.status === 403) {
		throw new Error(
			'The instance refused the token. Check it is right and that it has the "today:read" scope.'
		);
	}
	if (!response.ok) throw new Error(`The instance answered ${response.status}.`);

	return response.json();
}

/** "07:30  Deep work", or just the title for something with no time. */
const blockLine = (block) =>
	`${block.start_time ? `${block.start_time}  ` : ''}${block.title}${
		block.status === 'done' ? ' ✓' : ''
	}`;

/**
 * The message.
 *
 * Written to be read on a lock screen, so: short lines, no decoration, and
 * nothing said about a section that is empty. A digest that always has three
 * headings is a digest people stop opening.
 */
function compose(board) {
	const lines = [];

	const pending = board.blocks.filter((b) => b.status !== 'done' && b.status !== 'skipped');
	if (pending.length > 0) {
		lines.push('Today');
		for (const block of pending) lines.push(`  ${blockLine(block)}`);
	}

	const habits = board.habits.filter((h) => !h.done);
	if (habits.length > 0) {
		lines.push('', 'Habits');
		for (const habit of habits) {
			// The streak is the only reason anybody looks at this line.
			lines.push(`  ${habit.name}${habit.streak > 1 ? `  (${habit.streak} days)` : ''}`);
		}
	}

	// Overdue first: something owed from Tuesday is the thing worth surfacing,
	// and it is the thing a planner otherwise lets you quietly forget.
	const tasks = [...board.tasks].sort((a, b) => Number(b.overdue) - Number(a.overdue));
	if (tasks.length > 0) {
		lines.push('', 'To do');
		for (const task of tasks)
			lines.push(`  ${task.title}${task.overdue ? '  (carried over)' : ''}`);
	}

	if (lines.length === 0) return 'Nothing planned today.';
	return lines.join('\n');
}

/**
 * Where it goes.
 *
 * Whichever is configured, and stdout when none is — which is also how to see
 * what it would send before pointing it anywhere.
 */
async function deliver(text) {
	const ntfy = process.env.NTFY_TOPIC;
	if (ntfy) {
		const res = await fetch(ntfy, {
			method: 'POST',
			headers: { title: 'Today', 'content-type': 'text/plain; charset=utf-8' },
			body: text
		});
		if (!res.ok) throw new Error(`ntfy answered ${res.status}.`);
		return 'ntfy';
	}

	const telegramToken = process.env.TELEGRAM_TOKEN;
	const chat = process.env.TELEGRAM_CHAT;
	if (telegramToken && chat) {
		const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
		});
		if (!res.ok) throw new Error(`Telegram answered ${res.status}: ${await res.text()}`);
		return 'Telegram';
	}

	console.log(text);
	return 'stdout';
}

try {
	const board = await today();
	const where = await deliver(compose(board));
	// One line, so a cron mail is one line when it worked.
	console.error(`onto-morning: ${board.date} sent to ${where}`);
} catch (error) {
	// Loud and non-zero, because the only thing worse than no digest is a cron
	// job that has been failing silently since March.
	console.error(`onto-morning: ${error.message}`);
	process.exit(1);
}
