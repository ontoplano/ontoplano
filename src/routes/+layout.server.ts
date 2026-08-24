import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { DEFAULT_THEME, DEFAULT_WEEK, getTheme, getWeekSettings } from '$lib/server/settings';
import { listCategories } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';

export const load: LayoutServerLoad = async (event) => {
	// Anything under /login, not just /login itself — /login/reset is where a
	// password-reset link lands, and by definition its visitor is signed out.
	const isLoginPage = event.url.pathname === '/login' || event.url.pathname.startsWith('/login/');
	const isDemo = event.url.pathname.startsWith('/demo');
	// The offline fallback has to render without a session check — reaching it
	// means the network is down, so there is nothing to check against.
	const isOffline = event.url.pathname === '/offline';
	const isAuthApi = event.url.pathname.startsWith('/api/auth');

	if (!event.locals.user && !isLoginPage && !isDemo && !isAuthApi && !isOffline) {
		return redirect(302, '/login');
	}

	let userCategories: { id: number; name: string; color: string; colorLight: string }[] = [];
	let theme = DEFAULT_THEME;
	let week = DEFAULT_WEEK;
	if (event.locals.user) {
		const ctx = buildCtx(event.locals.user.id);
		userCategories = listCategories(ctx).map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			colorLight: c.colorLight
		}));
		theme = getTheme(ctx.userId);
		week = getWeekSettings(ctx.userId);
	}

	return {
		user: event.locals.user ?? null,
		categories: userCategories,
		theme,
		// The week is the user's, not the instance's.
		config: { week }
	};
};
