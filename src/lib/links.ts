/**
 * Where the app points when it points away from itself.
 *
 * Two addresses, both of them an operator's to change: an instance run by
 * somebody else has its own documentation and its own front page, and they are
 * `docs_url` and `site_url` in `config.toml`. What is here is the shape — the
 * defaults for a build with no server to ask, and the fact that supporting
 * ontoplano is a section of its one page rather than a page of its own.
 */
export const DEFAULT_DOCS_URL = 'https://docs.ontoplano.com';
export const DEFAULT_SITE_URL = 'https://ontoplano.com';

/** The site is a single page; this is the part of it that takes money. */
export const SUPPORT_FRAGMENT = '#support';

/** The two links the shell offers, from whatever the instance calls them. */
export type OutwardLinks = { docs: string; support: string };

export function outwardLinks(
	docsUrl: string = DEFAULT_DOCS_URL,
	siteUrl: string = DEFAULT_SITE_URL
): OutwardLinks {
	return {
		docs: docsUrl,
		support: `${siteUrl.replace(/\/$/, '')}/${SUPPORT_FRAGMENT}`
	};
}
