import type { Actions, PageServerLoad } from './$types';
import { isStyle, STYLES, STYLE_HINTS, STYLE_LABELS } from '$lib/style';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';
import { createQuote, deleteQuote, listQuotes } from '$lib/server/services/quotes';
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
	isTheme,
	setStyle,
	setTheme,
	setTimezone,
	setUserSetting,
	setWeekSettings
} from '$lib/server/settings';

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
		const style = formData.get('style')?.toString() ?? '';

		try {
			if (!isStyle(style)) throw new ValidationError('Unknown style');
			setStyle(locals.user!.id, style);
			return { success: true, action: 'setStyle' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setTheme: async ({ request, locals }) => {
		const formData = await request.formData();
		const theme = formData.get('theme')?.toString() ?? '';

		try {
			if (!isTheme(theme)) throw new ValidationError('Unknown theme');
			setTheme(locals.user!.id, theme);
			return { success: true, action: 'setTheme' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveWeek: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			const firstDay = Number(formData.get('firstDay') ?? 0);
			const generateDay = Number(formData.get('generateDay') ?? 6);
			const timezone = formData.get('timezone')?.toString()?.trim() ?? '';

			if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6)
				throw new ValidationError('Invalid first day');
			if (!Number.isInteger(generateDay) || generateDay < 0 || generateDay > 6)
				throw new ValidationError('Invalid generate day');

			if (timezone) {
				try {
					// Rejected here rather than stored and thrown on every date later.
					new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
				} catch {
					throw new ValidationError('Unknown timezone');
				}
				setTimezone(locals.user!.id, timezone);
			}

			setWeekSettings(locals.user!.id, { firstDay, generateDay });
			return { success: true, action: 'saveWeek' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
