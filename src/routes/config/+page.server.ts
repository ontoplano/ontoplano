import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadConfig, saveConfig, DB_PATH } from '$lib/server/config';
import { db } from '$lib/server/db';
import { quotes } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import {
	DASHBOARD_CARDS,
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import { getTheme, getUserSetting, isTheme, setTheme, setUserSetting } from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const config = loadConfig();
	const userId = locals.user!.id;
	return {
		config,
		theme: getTheme(userId),
		cards: DASHBOARD_CARDS,
		layout: parseLayout(getUserSetting(userId, DASHBOARD_LAYOUT_KEY)),
		quotes: db
			.select({ id: quotes.id, text: quotes.text, author: quotes.author })
			.from(quotes)
			.where(eq(quotes.userId, userId))
			.orderBy(quotes.id)
			.all()
	};
};

export const actions: Actions = {
	setLayout: async ({ request, locals }) => {
		const formData = await request.formData();
		const ids = formData.getAll('card').map((v) => String(v)) as DashboardCardId[];
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(ids));
		return { success: true, action: 'setLayout' };
	},

	resetLayout: async ({ locals }) => {
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(defaultLayout()));
		return { success: true, action: 'setLayout' };
	},

	addQuote: async ({ request, locals }) => {
		const formData = await request.formData();
		const text = formData.get('text')?.toString()?.trim() ?? '';
		if (!text) return fail(400, { message: 'A quote needs some words' });

		db.insert(quotes)
			.values({
				userId: locals.user!.id,
				text,
				author: formData.get('author')?.toString()?.trim() ?? ''
			})
			.run();

		return { success: true, action: 'addQuote' };
	},

	deleteQuote: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(quotes)
			.where(and(eq(quotes.id, id), eq(quotes.userId, locals.user!.id)))
			.run();

		return { success: true, action: 'deleteQuote' };
	},

	setTheme: async ({ request, locals }) => {
		const formData = await request.formData();
		const theme = formData.get('theme')?.toString() ?? '';

		if (!isTheme(theme)) return fail(400, { message: 'Unknown theme' });

		setTheme(locals.user!.id, theme);

		return { success: true, action: 'setTheme' };
	},

	save: async ({ request }) => {
		const formData = await request.formData();
		const host = formData.get('host')?.toString()?.trim() ?? '0.0.0.0';
		const port = Number(formData.get('port') || 1493);
		const firstDay = Number(formData.get('firstDay') ?? 0);
		const generateDay = Number(formData.get('generateDay') ?? 6);

		if (!host) return fail(400, { message: 'Host is required' });
		if (port < 1 || port > 65535) return fail(400, { message: 'Port must be between 1 and 65535' });
		if (firstDay < 0 || firstDay > 6) return fail(400, { message: 'Invalid first day' });
		if (generateDay < 0 || generateDay > 6) return fail(400, { message: 'Invalid generate day' });

		const current = loadConfig();

		saveConfig({
			server: { host, port },
			database: { path: current.database.path || DB_PATH },
			week: { firstDay, generateDay }
		});

		return { success: true, action: 'save' };
	}
};
