import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { loadConfig } from '$lib/server/config';

function hexToLightVariant(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const lr = Math.round(r + (255 - r) * 0.85);
	const lg = Math.round(g + (255 - g) * 0.85);
	const lb = Math.round(b + (255 - b) * 0.85);
	return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

export const load: LayoutServerLoad = async (event) => {
	const isLoginPage = event.url.pathname === '/login';
	const isDemo = event.url.pathname.startsWith('/demo');
	const isAuthApi = event.url.pathname.startsWith('/api/auth');

	if (!event.locals.user && !isLoginPage && !isDemo && !isAuthApi) {
		return redirect(302, '/login');
	}

	const config = loadConfig();

	return {
		user: event.locals.user ?? null,
		colors: {
			duty: config.colors.duty,
			skill: config.colors.skill,
			money: config.colors.money,
			dutyLight: hexToLightVariant(config.colors.duty),
			skillLight: hexToLightVariant(config.colors.skill),
			moneyLight: hexToLightVariant(config.colors.money)
		}
	};
};
