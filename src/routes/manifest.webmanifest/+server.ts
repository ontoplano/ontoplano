import type { RequestHandler } from './$types';

import { isStaging } from '$lib/server/settings';

/**
 * The installed app's own identity, which is not the same on every instance.
 *
 * Served rather than shipped as a static file for one reason: two copies of
 * this app can be installed on one phone — the instance somebody actually uses
 * and the staging one — and if they claim the same name, the same id and the
 * same icons, they are indistinguishable on a home screen. The week then goes
 * into whichever one was tapped, which is a data loss nobody would think to
 * report as a bug.
 *
 * Everything else here is production's manifest verbatim. Staging changes the
 * three things a launcher shows and nothing else, because a staging instance
 * that differs in any other way has stopped standing in for the one it copies.
 */
const ICONS = [
	{ file: 'icon', sizes: '192x192', purpose: 'any' as const, size: 192 },
	{ file: 'icon', sizes: '512x512', purpose: 'any' as const, size: 512 },
	{ file: 'icon-maskable', sizes: '192x192', purpose: 'maskable' as const, size: 192 },
	{ file: 'icon-maskable', sizes: '512x512', purpose: 'maskable' as const, size: 512 }
];

const SHORTCUTS = [
	{
		name: 'Board',
		short_name: 'Board',
		url: '/planner/board',
		description: "Today's columns",
		icon: 'shortcut-board'
	},
	{
		name: 'New diary entry',
		short_name: 'Diary',
		url: '/diary',
		description: 'Write an entry',
		icon: 'shortcut-diary'
	},
	{
		name: 'Goals',
		short_name: 'Goals',
		url: '/goals',
		description: 'Goals and progress',
		icon: 'shortcut-goals'
	}
];

export const GET: RequestHandler = async () => {
	const staging = isStaging();
	// The suffix is the whole difference. `scripts/build-icons.mjs` draws both
	// sets from the same logo, so the day the mark changes they both change.
	const mark = staging ? '-staging' : '';

	const manifest = {
		name: staging ? 'Ontoplano staging' : 'Ontoplano',
		short_name: staging ? 'Staging' : 'Ontoplano',
		description:
			'Run your life like a business: plans, tasks, goals and the record of what you actually did.',
		// A distinct id, or a browser treats the two as one installed app and
		// the second install silently replaces the first.
		id: staging ? '/?staging' : '/',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		orientation: 'any',
		background_color: '#111827',
		theme_color: '#111827',
		categories: ['productivity', 'lifestyle'],
		icons: ICONS.map((i) => ({
			src: `/icons/${i.file}-${i.size}${mark}.png`,
			sizes: i.sizes,
			type: 'image/png',
			purpose: i.purpose
		})),
		shortcuts: SHORTCUTS.map((s) => ({
			name: s.name,
			short_name: s.short_name,
			url: s.url,
			description: s.description,
			icons: [{ src: `/icons/${s.icon}.png`, sizes: '192x192', type: 'image/png' }]
		}))
	};

	return new Response(JSON.stringify(manifest, null, '\t'), {
		headers: {
			'content-type': 'application/manifest+json',
			// Short, so a rename reaches an installed copy within the hour rather
			// than at the next hard reload nobody performs.
			'cache-control': 'public, max-age=3600'
		}
	});
};
