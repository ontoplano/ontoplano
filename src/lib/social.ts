/**
 * Signing in with somebody else's account.
 *
 * Which of these an instance offers is a deployment decision — each one needs
 * credentials registered with that provider, and an instance with none
 * configured shows none of them rather than a row of buttons that fail. So the
 * list is derived from what is actually set, on both sides.
 *
 * The vocabulary lives here, out of the server module, so the sign-in page can
 * name and draw them without pulling the auth stack into the browser.
 */
export const SOCIAL_PROVIDERS = ['google', 'github'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_LABELS: Record<SocialProvider, string> = {
	google: 'Google',
	github: 'GitHub'
};

/**
 * Each provider's mark, as a path drawn at 24×24.
 *
 * Their own glyphs rather than a generic key, because a sign-in button people
 * do not recognise in half a second is a button they do not press. Simplified
 * to a single path so they sit in the same `<Icon>` shape as everything else.
 */
export const SOCIAL_GLYPHS: Record<SocialProvider, string> = {
	google:
		'M21.35 11.1H12v3.8h5.35c-.25 1.4-1.7 4.1-5.35 4.1a6 6 0 1 1 0-12c1.7 0 2.9.7 3.6 1.35l2.45-2.4A9.5 9.5 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.85 9.1-9.3 0-.65-.05-1.1-.15-1.6z',
	github:
		'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z'
};

/**
 * Which of these an instance actually has credentials for.
 *
 * Takes the environment rather than reading it, so it can be tested without a
 * process to set variables on — and so the server module has one less thing in
 * it that only works at runtime.
 */
export function configuredProviders(env: Record<string, string | undefined>): SocialProvider[] {
	return SOCIAL_PROVIDERS.filter((id) => {
		const key = id.toUpperCase();
		return Boolean(env[`${key}_CLIENT_ID`]?.trim() && env[`${key}_CLIENT_SECRET`]?.trim());
	});
}
