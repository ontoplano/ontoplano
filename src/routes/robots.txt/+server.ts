import { isDemo, isSelfHosted } from '$lib/server/settings';
import type { RequestHandler } from './$types';

/**
 * What a crawler is welcome to read.
 *
 * A route rather than a file in `static/`, because the right answer differs by
 * instance and a static file cannot know which one it is on.
 *
 * Worth being honest about what this does and does not do. It is a request, and
 * only well-behaved crawlers honour it — the addresses fail2ban is banning are
 * hitting sixty failed requests a minute looking for `/wp-admin` and `.env`, and
 * they have never read a robots.txt in their lives. This is here so that the
 * pages behind a login do not turn up in a search result, and so that the demo
 * is not indexed as a second copy of the site; the banning stays fail2ban's job.
 *
 * Everything under a login already redirects, so a crawler learns nothing from
 * following them — but a redirect still costs a request, and a list of paths
 * that were crawled and bounced is noise in the log.
 */
export const GET: RequestHandler = () => {
	// The demo is a throwaway copy of the app that is wiped every hour. Indexed,
	// it competes with the real site for the same words and offers a searcher a
	// shared account full of somebody else's seeded week.
	const body = isDemo()
		? ['User-agent: *', 'Disallow: /', ''].join('\n')
		: [
				'User-agent: *',
				// The pitch and the policies are the whole public surface.
				'Allow: /$',
				'Allow: /legal/',
				'Disallow: /account/',
				'Disallow: /admin',
				'Disallow: /api/',
				'Disallow: /buy',
				'Disallow: /data/',
				'Disallow: /diary/',
				'Disallow: /goals',
				'Disallow: /health/',
				'Disallow: /healthz',
				'Disallow: /ideas',
				'Disallow: /kitchen/',
				'Disallow: /login',
				'Disallow: /planner/',
				'Disallow: /search',
				'Disallow: /settings/',
				'Disallow: /shopping',
				'Disallow: /welcome',
				''
			].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// It changes when the instance's configuration changes, which is
			// rarely, and a crawler re-reading it hourly costs nothing either way.
			'cache-control': isSelfHosted() ? 'no-store' : 'public, max-age=3600'
		}
	});
};
