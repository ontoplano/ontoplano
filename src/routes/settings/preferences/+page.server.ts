import type { Actions, PageServerLoad } from './$types';
import { STYLES, STYLE_HINTS, STYLE_LABELS } from '$lib/style';
import { clientErrorState, setClientErrorConsent } from '$lib/server/services/client-errors';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { createQuote, deleteQuote, importQuotes, listQuotes } from '$lib/server/services/quotes';
import { CURRENCIES, isCurrency } from '$lib/money';
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
import { accentsWith, placesFor } from '$lib/nav-order';
import { NAV_PLACES } from '$lib/sections-nav';
import { SECTIONS, type SectionKey } from '$lib/colors';
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
		theme: getTheme(ctx.userId),
		style: getStyle(ctx.userId),
		// A hidden section's card is not offered here either — one toggle, one
		// truth. The stored layout keeps the card, so unhiding restores it.
		cards: visibleCards(hiddenSections),
		layout: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)).filter((id) =>
			visibleCards(hiddenSections).some((c) => c.id === id)
		),
		// The rooms, in this account's order and with its colours applied — one
		// list for the page to show, rather than a list plus two settings the
		// page would have to combine itself and get subtly wrong.
		rooms: placesFor(NAV_PLACES, {
			order: getNavOrder(ctx.userId),
			colors: getSectionColors(ctx.userId)
		}).map((p) => ({ key: p.key, label: p.label, section: p.section, accent: p.accent })),
		// The things a colour belongs to. A *section*, not a room: People and
		// Notebooks live in the Diary and wear its colour, and letting one
		// section arrive on screen in three hues is what the colours exist to
		// prevent. `isDefault` is here rather than in the page because the page
		// would have to compare hex strings to work it out.
		sectionColors: Object.entries(SECTIONS).map(([key, section]) => ({
			key,
			label: section.label,
			accent: accentsWith(getSectionColors(ctx.userId))[key as SectionKey],
			isDefault:
				accentsWith(getSectionColors(ctx.userId))[key as SectionKey].toLowerCase() ===
				section.accent.toLowerCase()
		})),
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
		const chosen = formData.get('currency');
		if (!isCurrency(chosen)) return fail(400, { message: 'Unknown currency' });

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

	setSections: async ({ request, locals }) => {
		const formData = await request.formData();
		// The boxes name what is SHOWN; everything unchecked is hidden. An
		// unknown id in the post is ignored the way an unknown stored id is.
		const shown = new Set(formData.getAll('section').map(String));
		setHiddenSections(
			locals.user!.id,
			HIDEABLE_SECTIONS.map((s) => s.id).filter((id) => !shown.has(id) && isHideableSection(id))
		);
		return { success: true, action: 'setSections' };
	},

	/**
	 * The order of the rooms, as the list of keys the form posted.
	 *
	 * Validation is deliberately thin here and thorough on the way out: what
	 * counts as a room changes as the app grows, so `applyOrder` is the one
	 * place that decides what a stored key means — see `$lib/nav-order.ts`.
	 */
	setNavOrder: async ({ request, locals }) => {
		const formData = await request.formData();
		setNavOrder(locals.user!.id, formData.getAll('room').map(String));
		return { success: true, action: 'setNavOrder' };
	},

	/** Back to the order the app ships with. */
	resetNavOrder: async ({ locals }) => {
		setNavOrder(locals.user!.id, []);
		return { success: true, action: 'setNavOrder' };
	},

	/**
	 * The colours, one per section.
	 *
	 * A colour ends up in a `style` attribute, which very few settings do, so
	 * `setSectionColors` keeps only `#rrggbb` for a section that exists — and
	 * `accentsWith` checks again when the value is read back. Belt and braces
	 * on purpose: this is the one preference that reaches the page as markup.
	 */
	setSectionColors: async ({ request, locals }) => {
		const formData = await request.formData();
		const colors: Record<string, string> = {};
		for (const [key, value] of formData.entries()) {
			if (key.startsWith('color.')) colors[key.slice('color.'.length)] = String(value);
		}
		setSectionColors(locals.user!.id, colors);
		return { success: true, action: 'setSectionColors' };
	},

	resetSectionColors: async ({ locals }) => {
		setSectionColors(locals.user!.id, {});
		return { success: true, action: 'setSectionColors' };
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
