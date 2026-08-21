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
import {
	getTheme,
	getUserSetting,
	getWeekSettings,
	isInstanceOwner,
	isTheme,
	setTheme,
	setUserSetting,
	setWeekSettings
} from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const config = loadConfig();
	const userId = locals.user!.id;
	const canEditInstance = isInstanceOwner(userId);
	return {
		// Deployment settings are shown to everyone but writable only by whoever
		// runs the instance; week settings belong to each account.
		config,
		canEditInstance,
		week: getWeekSettings(userId),
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

	/**
	 * Bind host, port and database path.
	 *
	 * These describe the deployment, not the account, so they are only writable
	 * on a self-hosted instance by its owner. This action previously never
	 * looked at `locals.user` at all: any registered account could rewrite where
	 * the server listens.
	 */
	saveInstance: async ({ request, locals }) => {
		if (!isInstanceOwner(locals.user!.id))
			return fail(403, { message: 'Only the instance owner can change deployment settings' });

		const formData = await request.formData();
		const host = formData.get('host')?.toString()?.trim() ?? '0.0.0.0';
		const port = Number(formData.get('port') || 1493);

		if (!host) return fail(400, { message: 'Host is required' });
		if (port < 1 || port > 65535) return fail(400, { message: 'Port must be between 1 and 65535' });

		const current = loadConfig();
		saveConfig({
			server: { host, port },
			database: { path: current.database.path || DB_PATH },
			week: current.week
		});

		return { success: true, action: 'saveInstance' };
	},

	/** Which day your week starts on. Yours, not the server's. */
	saveWeek: async ({ request, locals }) => {
		const formData = await request.formData();
		const firstDay = Number(formData.get('firstDay') ?? 0);
		const generateDay = Number(formData.get('generateDay') ?? 6);

		if (firstDay < 0 || firstDay > 6) return fail(400, { message: 'Invalid first day' });
		if (generateDay < 0 || generateDay > 6) return fail(400, { message: 'Invalid generate day' });

		setWeekSettings(locals.user!.id, { firstDay, generateDay });

		return { success: true, action: 'saveWeek' };
	}
};
