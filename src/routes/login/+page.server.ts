import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { checkPassword } from '$lib/passwords';
import { APIError } from 'better-auth/api';
import { isEmailConfigured } from '$lib/server/email';
import { isDemo, isStaging } from '$lib/server/settings';
import {
	checkSignUpAllowed,
	consumeInvite,
	instanceIsEmpty,
	registrationMode
} from '$lib/server/services/registration';
import { clientKey, rateLimit, signUpBudget } from '$lib/server/rate-limit';
import { ServiceError } from '$lib/server/services/errors';
import { toActionFailure } from '$lib/server/http-errors';
import { record } from '$lib/server/services/audit';
import { isDemoAccount, resetDemoAccount } from '$lib/server/services/demo';
import { claimFirstAccount } from '$lib/server/services/admin';
import { onboardEntitlement, whyItCannotSell } from '$lib/server/services/billing';
import { WANTED_PLAN_COOKIE } from '$lib/server/services/plan-intent';

export const load: PageServerLoad = async (event) => {
	// On the demo, the session that arrives here is almost always a minted
	// visitor copy — and this form is the operator's only way in, so it stays
	// reachable instead of bouncing to the dashboard. Signing in simply
	// replaces the visitor session. An account with a password of its own is
	// signed in for real and goes home like anywhere else.
	if (event.locals.user && !(isDemo() && isDemoAccount(event.locals.user.id))) {
		return redirect(302, '/');
	}
	// The front page's Create account lands straight on the register form
	// (?register) — one step fewer between "I want this" and the first field.
	const openRegister = event.url.searchParams.has('register');
	/*
	 * An invitation arrives as a link, not as a string to paste.
	 *
	 * The code goes in the field for them, so the whole of what somebody has to
	 * do with an invitation is follow the link and fill in their name. Read into
	 * the form rather than consumed here: nothing is spent until the account
	 * exists.
	 */
	const invited = event.url.searchParams.get('invite')?.trim() ?? '';
	/*
	 * "Buy the family plan" is a decision made on the front page, three steps
	 * before there is anywhere to charge — register, confirm the address, and
	 * only then the card. It rides along in a cookie so the card step opens on
	 * the plan that was actually chosen, rather than quietly selling one seat
	 * to somebody who pressed a button that said five.
	 *
	 * Losing it is survivable by design: /start offers both plans whatever the
	 * cookie says, so a link followed on the phone and confirmed on the laptop
	 * costs the person a click, not the plan.
	 */
	const wantsFamily = event.url.searchParams.get('plan') === 'family';
	if (wantsFamily) {
		event.cookies.set(WANTED_PLAN_COOKIE, 'family', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
	}
	// The reset form says so up front when the server cannot send mail, rather
	// than claiming a link is on its way.
	//
	// `canRegister` decides whether the page offers registration at all: a
	// closed instance showing a "Register" link is a form that only ever says
	// no. The first account is always allowed, or a fresh install is unusable.
	const mode = registrationMode();
	const first = instanceIsEmpty();

	return {
		emailConfigured: isEmailConfigured(),
		openRegister,
		canRegister: first || mode !== 'closed',
		needsInvite: !first && mode === 'invite',
		/** Prefilled from the link, and shown even where a code is not required. */
		invite: invited,
		isFirstAccount: first,
		/** Named on the register form, so the plan chosen is the plan shown. */
		wantedPlan: wantsFamily ? ('family' as const) : ('solo' as const),
		/** Says so before somebody puts their week into a copy of the app. */
		staging: isStaging()
	};
};

export const actions: Actions = {
	signIn: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		try {
			const signedIn = await auth.api.signInEmail({
				body: { email, password }
			});
			if (signedIn?.user?.id)
				record(signedIn.user.id, 'signed_in', { ip: event.getClientAddress() });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Sign in failed' });
			}
			console.error('Sign-in non-API error:', error);
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/');
	},
	/**
	 * Register, if this instance is taking anybody.
	 *
	 * The check is repeated here rather than left to the hook in
	 * `hooks.server.ts`: this action calls better-auth in-process, so the
	 * request never passes the hook. Two doors, one rule.
	 */
	signUp: async (event) => {
		// The same budget the hook applies to `/api/auth/sign-up`. Two doors,
		// one rule — and this one does not pass the hook at all.
		const budget = signUpBudget(clientKey(event.request, event.getClientAddress));
		if (!budget.allowed) {
			return fail(429, { message: 'Too many accounts from here. Try again later.' });
		}

		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';
		const now = new Date();

		// Typed twice, because this is the one password field with no way to
		// find out about a typo: there is no old password to compare against,
		// and the next time it is asked for is the next sign-in.
		if (password !== (formData.get('confirm')?.toString() ?? '')) {
			return fail(400, { message: 'The two passwords are not the same.' });
		}

		// Before the account exists, so a refused password does not burn an
		// invitation code or leave a half-made row behind.
		const weak = checkPassword(password);
		if (weak) return fail(400, { message: weak });

		let invite;
		try {
			invite = checkSignUpAllowed(formData.get('invite'), now).invite;
		} catch (error) {
			if (error instanceof ServiceError) return fail(403, { message: error.message });
			return fail(500, { message: 'Unexpected error' });
		}

		/*
		 * An instance that means to charge and cannot takes nobody's registration.
		 *
		 * Checked here, before the account row exists, rather than left to
		 * `onboardEntitlement` below — a refusal after `signUpEmail` would leave a
		 * real account with no entitlement and no way to get one. An invitation is
		 * exempt: somebody has already paid for that seat, and nothing about it
		 * touches a card.
		 *
		 * This is the state that gave the app away: registration worked, the
		 * fourteen days started, and nothing anywhere said the checkout had been
		 * skipped. Refusing is the smaller loss by a wide margin.
		 */
		const cannotSell = invite ? null : whyItCannotSell();
		if (cannotSell) {
			return fail(503, {
				message: 'Registration is closed right now — this instance cannot take a card.'
			});
		}

		// Where the fresh account goes. Card-first onboarding sends it to the
		// billing page — the fourteen days begin at the checkout. (Decided in
		// the try, used after it: `redirect` throws, and a throw inside this
		// try reads as a failed registration.)
		let landing = '/';
		try {
			const created = await auth.api.signUpEmail({
				body: { email, password, name }
			});

			// Only once the account exists, so a taken address does not burn a code.
			if (created?.user?.id) {
				if (invite) consumeInvite(invite.id, created.user.id, now);
				// An instance with nobody in it hands the first account the keys.
				claimFirstAccount(created.user.id);
				const onboarding = onboardEntitlement(created.user.id, invite, now);
				record(created.user.id, 'registered', { ip: event.getClientAddress() });
				if (onboarding === 'checkout') landing = '/start';
				// Confirm the address FIRST, then ask for the card. It ran the
				// other way round: somebody handed over a card and was only then
				// told to go and check their mailbox, which is the one order that
				// makes a card feel like a trick. The verify page knows where to
				// send them next, so nothing is skipped by going through it.
				//
				// Only where a mail can actually arrive. On an instance with no
				// SMTP the confirmation goes to the log, and a page telling
				// somebody to check a mailbox that will stay empty is a worse
				// first step than no step.
				if (!created.user.emailVerified && isEmailConfigured()) {
					landing = '/login/verify';
					// The mail that just went out is the minute's one send: seed
					// the resend bucket so the verify page opens with its button
					// counting down instead of inviting a refusal.
					rateLimit(`verify-resend:${created.user.id}`, 1, 60 * 1000);
				}
			}
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Registration failed' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, landing);
	},
	/**
	 * Ask for a reset link.
	 *
	 * Always reports the same thing whether or not the address exists — the
	 * response is otherwise a way to enumerate who has an account here.
	 */
	requestReset: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString()?.trim() ?? '';

		if (!email) return fail(400, { message: 'Enter your email address' });

		try {
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: '/login/reset' }
			});
		} catch (error) {
			// Logged, not surfaced: a failure here would otherwise reveal whether
			// the address is registered.
			if (!(error instanceof APIError)) console.error('Reset request error:', error);
		}

		return {
			success: true,
			action: 'requestReset',
			message: isEmailConfigured()
				? 'If that address has an account, a reset link is on its way.'
				: 'This server has no mail configured, so the link was written to its log instead.'
		};
	},

	signOut: async (event) => {
		if (event.locals.user) record(event.locals.user.id, 'signed_out');

		await auth.api.signOut({
			headers: event.request.headers
		});
		return redirect(302, '/login');
	},

	/*
	 * Put the demo back the way it was found.
	 *
	 * Here rather than on a settings page because it lives where Sign out lives
	 * — the demo has no way out, so the menu offers the thing somebody actually
	 * wants at that moment instead: a clean copy, without losing the session
	 * they cannot get back.
	 *
	 * Refused off a demo instance. Nothing about it would work anywhere else,
	 * and an action that erases an account is not one to leave lying around.
	 */
	resetDemo: async (event) => {
		if (!isDemo()) return fail(403, { message: 'Only the demo can be reset.' });
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Sign in first' });

		try {
			await resetDemoAccount(user.id);
		} catch (e) {
			return toActionFailure(e);
		}

		return redirect(303, '/');
	}
};
