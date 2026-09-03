import type { Actions, PageServerLoad } from './$types';
import { STYLES, STYLE_HINTS, STYLE_LABELS } from '$lib/style';
import { clientErrorState, setClientErrorConsent } from '$lib/server/services/client-errors';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { createQuote, deleteQuote, importQuotes, listQuotes } from '$lib/server/services/quotes';
import { CURRENCIES, normaliseCurrency } from '$lib/money';
import { fail } from '@sveltejs/kit';
import {
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	serialiseLayout,
	visibleCards,
	type DashboardCardId
} from '$lib/dashboard';
import { HIDEABLE_SECTIONS, isHideableSection } from '$lib/sections';
import { placesFor } from '$lib/nav-order';
import { zoneGroups } from '$lib/timezones';
import { NAV_PLACES } from '$lib/sections-nav';
import { SECTIONS } from '$lib/colors';
import {
	getCurrency,
	getHiddenSections,
	getGridHours,
	getNavOrder,
	getSectionColors,
	getStyle,
	getTheme,
	getTimezone,
	getUserSetting,
	getWeekSettings,
	setCurrency,
	setHiddenSections,
	setNavOrder,
	setSectionColors,
	setUserSetting
} from '$lib/server/settings';
import {
	saveGridHours,
	saveWeekPreferences,
	setUserStyle,
	setUserTheme
} from '$lib/server/services/preferences';

/** Everything on this page belongs to the account, never to the instance (I9). */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	const hiddenSections = getHiddenSections(ctx.userId);

	return {
		errorReports: clientErrorState(ctx.userId),
		sections: HIDEABLE_SECTIONS,
		hiddenSections,
		week: getWeekSettings(ctx.userId),
		gridHours: getGridHours(ctx.userId),
		currency: getCurrency(ctx.userId),
		currencies: CURRENCIES,
		timezone: getTimezone(ctx.userId) ?? ctx.tz,
		// Built here rather than in the browser: it is four hundred entries and
		// the offsets are today's, which the server already knows.
		zones: zoneGroups(),
		theme: getTheme(ctx.userId),
		style: getStyle(ctx.userId),
		// A hidden section's card is not offered here either — one toggle, one
		// truth. The stored layout keeps the card, so unhiding restores it.
		cards: visibleCards(hiddenSections),
		layout: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)).filter((id) =>
			visibleCards(hiddenSections).some((c) => c.id === id)
		),
		/*
		 * The rooms: one list, carrying everything there is to say about each.
		 *
		 * This was three lists — Sections, The menu, Colours — naming the same
		 * eight things three times and asking a different question of each. One
		 * row per room now, and the row holds all three answers.
		 *
		 * Home is not in it, because Home is not a room: the wordmark in the
		 * header and the house in the phone bar are the way back, and a row
		 * whose every control is disabled only teaches you the controls do not
		 * work.
		 *
		 * `ownsColor` is which row draws the colour picker. People and Notebooks
		 * live in the Diary and wear its colour, so they show it and cannot
		 * change it — three pickers for one value is three ways to disagree.
		 */
		rooms: (() => {
			const hidden = getHiddenSections(ctx.userId);
			const seen = new Set<string>();
			return placesFor(NAV_PLACES, {
				order: getNavOrder(ctx.userId),
				colors: getSectionColors(ctx.userId)
			}).map((p) => {
				const ownsColor = !seen.has(p.section);
				seen.add(p.section);
				return {
					key: p.key,
					label: p.label,
					section: p.section,
					accent: p.accent,
					ownsColor,
					/** Whose colour this row follows, when it is not its own. */
					colorFrom: ownsColor ? null : SECTIONS[p.section].label,
					/**
					 * The preference that puts this room away, if it has one.
					 * Not the same as its key — Recipes is the Kitchen section's
					 * room and hides under `recipes` — so it is carried rather
					 * than derived.
					 */
					hide: p.hide ?? null,
					hidden: p.hide !== undefined && hidden.includes(p.hide)
				};
			});
		})(),
		/** Whether anything has been changed from what the app ships with. */
		menuIsDefault:
			getNavOrder(ctx.userId).length === 0 &&
			Object.keys(getSectionColors(ctx.userId)).length === 0 &&
			getHiddenSections(ctx.userId).length === 0,
		quotes: listQuotes(ctx),
		styles: STYLES.map((key) => ({ key, label: STYLE_LABELS[key], hint: STYLE_HINTS[key] }))
	};
};

export const actions: Actions = {
	setErrorReports: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setClientErrorConsent(buildCtx(locals.user!.id), formData.get('decision'));
			return { success: true, action: 'setErrorReports' };
		} catch (e) {
			return toActionFailure(e);
		}
	},
	saveCurrency: async ({ request, locals }) => {
		const formData = await request.formData();
		// Any ISO code the platform will print, not just the eight on the list —
		// and normalised, because somebody typing it will type `brl`.
		const chosen = normaliseCurrency(formData.get('currency'));
		if (!chosen) {
			return fail(400, {
				message: 'That is not a currency code — three letters, like PLN or ZAR.'
			});
		}

		setCurrency(locals.user!.id, chosen);
		return { success: true, action: 'saveCurrency' };
	},

	saveGridHours: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveGridHours(buildCtx(locals.user!.id), {
				start: formData.get('start'),
				end: formData.get('end')
			});
			return { success: true, action: 'saveGridHours' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * The menu: its order, what is put away, and the colours. One form.
	 *
	 * Three settings, saved together, because they are three answers about the
	 * same eight rooms and splitting them into three forms is what made the page
	 * list everything three times.
	 *
	 * `room` arrives in the order the list showed, `hidden` names the ones put
	 * away, and `color.<section>` carries a hex per section. Each is validated
	 * where it is stored — see `$lib/nav-order.ts` and `server/settings.ts` —
	 * because what counts as a room and what counts as a colour both change
	 * independently of this form.
	 */
	saveMenu: async ({ request, locals }) => {
		const formData = await request.formData();
		const userId = locals.user!.id;

		setNavOrder(userId, formData.getAll('room').map(String));

		const away = new Set(formData.getAll('hidden').map(String));
		setHiddenSections(
			userId,
			HIDEABLE_SECTIONS.map((s) => s.id).filter((id) => away.has(id) && isHideableSection(id))
		);

		const colors: Record<string, string> = {};
		for (const [key, value] of formData.entries()) {
			if (key.startsWith('color.')) colors[key.slice('color.'.length)] = String(value);
		}
		setSectionColors(userId, colors);

		return { success: true, action: 'saveMenu' };
	},

	/** Back to the order, the colours and the sections the app ships with. */
	resetMenu: async ({ locals }) => {
		const userId = locals.user!.id;
		setNavOrder(userId, []);
		setSectionColors(userId, {});
		setHiddenSections(userId, []);
		return { success: true, action: 'saveMenu' };
	},

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
