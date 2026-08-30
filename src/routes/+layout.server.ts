import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { DEFAULT_THEME, DEFAULT_WEEK, getTheme, getWeekSettings } from '$lib/server/settings';
import { clientErrorState } from '$lib/server/services/client-errors';
import { needsFirstRun } from '$lib/server/services/onboarding';
import { listCategories } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';
import { loadConfig } from '$lib/server/config';

export const load: LayoutServerLoad = async (event) => {
	// Anything under /login, not just /login itself — /login/reset is where a
	// password-reset link lands, and by definition its visitor is signed out.
	const isLoginPage = event.url.pathname === '/login' || event.url.pathname.startsWith('/login/');
	const isDemo = event.url.pathname.startsWith('/demo');
	// The offline fallback has to render without a session check — reaching it
	// means the network is down, so there is nothing to check against.
	const isOffline = event.url.pathname === '/offline';
	const isAuthApi = event.url.pathname.startsWith('/api/auth');
	// The policies have to be readable by somebody deciding whether to sign up,
	// which is exactly somebody who is not signed in.
	const isLegal = event.url.pathname.startsWith('/legal');
	// The front page is the pitch when nobody is signed in. Sending a stranger
	// straight to a sign-in form asks them to commit before they know what this
	// is, which is the shortest possible funnel and the wrong one.
	const isLanding = event.url.pathname === '/';

	if (
		!event.locals.user &&
		!isLoginPage &&
		!isDemo &&
		!isAuthApi &&
		!isOffline &&
		!isLegal &&
		!isLanding
	) {
		return redirect(302, '/login');
	}

	// A new account meets first run before anything else: an empty grid is what
	// a stranger churns on. It asks twice for a timezone and a starting week,
	// then never appears again.
	const isWelcome = event.url.pathname === '/welcome';
	// The hold pages sit outside first-run on purpose: the gates in
	// hooks.server.ts bounce /welcome to them, and first-run sending the
	// visitor back again is a loop, not an onboarding.
	const isVerifyHold = ['/login/verify', '/start', '/buy'].includes(event.url.pathname);
	if (
		event.locals.user &&
		!isWelcome &&
		!isVerifyHold &&
		!isDemo &&
		!isAuthApi &&
		!event.url.pathname.startsWith('/api/') &&
		needsFirstRun(event.locals.user.id)
	) {
		return redirect(302, '/welcome');
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
		// Set while an administrator is borrowing this session. The banner it
		// draws is the whole point: nobody should be able to look at somebody's
		// diary without the screen saying so.
		impersonatedBy:
			(event.locals.session as { impersonatedBy?: string } | undefined)?.impersonatedBy ?? null,
		categories: userCategories,
		theme,
		// The week is the user's, not the instance's.
		config: { week },
		// How long a delete waits before it happens. The instance's call.
		undoSeconds: loadConfig().ui.undoSeconds,
		// Whether the page may offer to send client-side errors: 'off' unless
		// the instance enabled it, then the account's own once-asked answer.
		clientErrorReports: event.locals.user ? clientErrorState(event.locals.user.id) : 'off'
	};
};
