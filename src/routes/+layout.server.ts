import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { categories } from '$lib/server/db/schema';
import { DEFAULT_THEME, DEFAULT_WEEK, getTheme, getWeekSettings } from '$lib/server/settings';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
	// Anything under /login, not just /login itself — /login/reset is where a
	// password-reset link lands, and by definition its visitor is signed out.
	const isLoginPage = event.url.pathname === '/login' || event.url.pathname.startsWith('/login/');
	const isDemo = event.url.pathname.startsWith('/demo');
	const isAuthApi = event.url.pathname.startsWith('/api/auth');

	if (!event.locals.user && !isLoginPage && !isDemo && !isAuthApi) {
		return redirect(302, '/login');
	}

	let userCategories: { id: number; name: string; color: string; colorLight: string }[] = [];
	let theme = DEFAULT_THEME;
	let week = DEFAULT_WEEK;
	if (event.locals.user) {
		userCategories = db
			.select({
				id: categories.id,
				name: categories.name,
				color: categories.color,
				colorLight: categories.colorLight
			})
			.from(categories)
			.where(eq(categories.userId, event.locals.user.id))
			.all();
		theme = getTheme(event.locals.user.id);
		week = getWeekSettings(event.locals.user.id);
	}

	return {
		user: event.locals.user ?? null,
		categories: userCategories,
		theme,
		// The week is the user's, not the instance's.
		config: { week }
	};
};
