/**
 * Every mail the app sends, and what to call it where somebody reads a list.
 *
 * One object rather than a type here and a label map in the admin page: those
 * were two places, and a kind added to one of them showed up in /admin as its
 * own slug — `weekly-review` in a column of sentences. The type is derived
 * from the labels, so a new kind cannot compile without a name.
 *
 * Not under `server/` because the page that lists failures is a component.
 */
export const MAIL_KINDS = {
	verification: 'Address confirmation',
	'password-reset': 'Password reset',
	'address-change': 'Address change',
	'family-invite': 'Family invitation',
	'trial-notice': 'Trial notice',
	'weekly-review': 'Weekly review',
	'newsletter-confirm': 'Newsletter confirmation'
} as const;

export type MailKind = keyof typeof MAIL_KINDS;

/** The same list as a tuple, for the column that stores one. */
export const MAIL_KIND_NAMES = Object.keys(MAIL_KINDS) as [MailKind, ...MailKind[]];

export function mailKindLabel(kind: string): string {
	return (MAIL_KINDS as Record<string, string>)[kind] ?? kind;
}
