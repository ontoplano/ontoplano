import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const isLoginPage = event.url.pathname === '/login';
	const isDemo = event.url.pathname.startsWith('/demo');
	const isAuthApi = event.url.pathname.startsWith('/api/auth');

	if (!event.locals.user && !isLoginPage && !isDemo && !isAuthApi) {
		return redirect(302, '/login');
	}

	return {
		user: event.locals.user ?? null
	};
};
