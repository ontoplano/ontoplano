import type { Actions, PageServerLoad } from './$types';
import { STYLES, STYLE_HINTS, STYLE_LABELS } from '$lib/style';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { createQuote, deleteQuote, importQuotes, listQuotes } from '$lib/server/services/quotes';
import {
	DASHBOARD_CARDS,
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import {
	getStyle,
	getTheme,
	getTimezone,
	getUserSetting,
	getWeekSettings,
	setUserSetting
} from '$lib/server/settings';
import { saveWeekPreferences, setUserStyle, setUserTheme } from '$lib/server/services/preferences';

/** Everything on this page belongs to the account, never to the instance (I9). */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		week: getWeekSettings(ctx.userId),
		timezone: getTimezone(ctx.userId) ?? ctx.tz,
		theme: getTheme(ctx.userId),
		style: getStyle(ctx.userId),
		cards: DASHBOARD_CARDS,
		layout: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)),
		quotes: listQuotes(ctx),
		styles: STYLES.map((key) => ({ key, label: STYLE_LABELS[key], hint: STYLE_HINTS[key] }))
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

		try {
			createQuote(buildCtx(locals.user!.id), {
				text: formData.get('text'),
				author: formData.get('author')
			});
			return { success: true, action: 'addQuote' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	importQuotes: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			const result = importQuotes(buildCtx(locals.user!.id), formData.get('quotes'));
			return {
				success: true,
				action: 'importQuotes',
				message:
					result.skipped > 0
						? `Added ${result.added}. Skipped ${result.skipped} already there or empty.`
						: `Added ${result.added}.`
			};
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteQuote: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			deleteQuote(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteQuote' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setStyle: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			setUserStyle(buildCtx(locals.user!.id), formData.get('style'));
			return { success: true, action: 'setStyle' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setTheme: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			setUserTheme(buildCtx(locals.user!.id), formData.get('theme'));
			return { success: true, action: 'setTheme' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveWeek: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			saveWeekPreferences(buildCtx(locals.user!.id), {
				firstDay: formData.get('firstDay'),
				generateDay: formData.get('generateDay'),
				timezone: formData.get('timezone')
			});
			return { success: true, action: 'saveWeek' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
