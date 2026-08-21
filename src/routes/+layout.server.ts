import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { loadConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { categories } from '$lib/server/db/schema';
import { DEFAULT_THEME, getFeatureFlags, getTheme } from '$lib/server/settings';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
	const isLoginPage = event.url.pathname === '/login';
	const isDemo = event.url.pathname.startsWith('/demo');
	const isAuthApi = event.url.pathname.startsWith('/api/auth');

	if (!event.locals.user && !isLoginPage && !isDemo && !isAuthApi) {
		return redirect(302, '/login');
	}

	const config = loadConfig();

	let userCategories: { id: number; name: string; color: string; colorLight: string }[] = [];
	let features: Record<string, boolean> = {};
	let theme = DEFAULT_THEME;
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
		features = getFeatureFlags(event.locals.user.id);
		theme = getTheme(event.locals.user.id);
	}

	return {
		user: event.locals.user ?? null,
		categories: userCategories,
		features,
		theme,
		config: {
			week: config.week
		}
	};
};
