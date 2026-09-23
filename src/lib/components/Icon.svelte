<script lang="ts" module>
	/**
	 * The icon set.
	 *
	 * Inline paths rather than a package: the CSP forbids external assets, the
	 * app already draws its nav this way, and thirty glyphs is not worth a
	 * dependency that ships to a webview. Drawn on a 24×24 grid, stroked rather
	 * than filled unless `FILLED` says otherwise, so they sit at the weight of
	 * the text beside them.
	 *
	 * Emoji are not an option — they are somebody else's typeface, they carry a
	 * colour we did not choose, and they render differently on every platform.
	 *
	 * `FILLED` is for the few that are a shape rather than a line. GitHub's
	 * mark is somebody else's and is recognisable only as itself. The funnel is
	 * ours and is one anyway: stroked at 1.75 on a 14px button it is a thin
	 * wireframe triangle with a tail, which is not what a funnel looks like.
	 * Both take `currentColor` as their fill, so they still sit at the weight
	 * of the text beside them.
	 */
	/** Marks drawn as a filled shape rather than a stroked line. */
	export const FILLED: Partial<Record<string, true>> = { github: true, filter: true };

	export const ICONS = {
		// actions
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
		trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
		close: 'M6 6l12 12M18 6L6 18',
		check: 'M4 12l5 5L20 6',
		undo: 'M4 10h10a5 5 0 1 1 0 10H9M4 10l4-4M4 10l4 4',
		skip: 'M5 5l9 7-9 7zM18 5v14',
		play: 'M7 4l12 8-12 8z',
		/* The three a recorder needs. Square caps like everything else here. */
		pause: 'M9 5v14M15 5v14',
		stop: 'M6 6h12v12H6z',
		mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
		/* What the app has said. Square caps, like everything else here. */
		bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4',
		filter: 'M4 5h16l-6 7v6l-4 2v-8z',
		download: 'M12 4v10M8 10l4 4 4-4M5 19h14',
		copy: 'M9 4h9v13M5 8h9v12H5z',
		drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
		// Four corners leaving: take the whole screen.
		maximize: 'M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5',
		more: 'M6 12h.01M12 12h.01M18 12h.01',

		// direction
		'chevron-left': 'M14 6l-6 6 6 6',
		'chevron-right': 'M10 6l6 6-6 6',
		'chevron-down': 'M6 10l6 6 6-6',
		'chevron-up': 'M6 14l6-6 6 6',
		'arrow-right': 'M5 12h14M13 6l6 6-6 6',
		'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
		'arrow-down': 'M12 5v14M18 13l-6 6-6-6',
		'arrow-up': 'M12 19V5M6 11l6-6 6 6',

		// the sections
		home: 'M3 10.5 12 3l9 7.5V21H3z',
		planner: 'M4 5h16v16H4zM4 9h16M9 9v12M15 9v12',
		goals: 'M12 3v18M4 6h14l-3 4 3 4H4z',
		diary: 'M5 3h14v18H5zM9 3v18M12 8h4M12 12h4',
		ideas: 'M9 21h6M10 18h4M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z',
		health: 'M3 12h4l2 6 4-14 2 8h6',
		// Concentric rings and the bullseye: logging a habit is hitting the mark.
		target:
			'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.25a0.75 0.75 0 1 0 0 1.5 0.75 0.75 0 0 0 0-1.5z',
		shopping: 'M4 7h16l-1.5 12h-13zM9 7V5a3 3 0 0 1 6 0v2',
		// Put away rather than thrown away: the lid, the box, and the arrow down
		// into it — the gesture a chat app archives a conversation with.
		archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
		/*
		 * Three arrows chasing each other round a triangle.
		 *
		 * For notes whose notebook was deleted: they were not thrown away, they
		 * are waiting to be put somewhere. A bin says the opposite of what that
		 * chip is for — it is where things go to come back.
		 *
		 * Six subpaths in one `d`: three sides, each ending in a chevron. Drawn
		 * on the same 24x24 grid as the rest, and it has to survive being 16px
		 * in a corner — the first attempt at this was hand-placed coordinates
		 * and rendered as a squiggle.
		 */
		recycle:
			'M7 19H4.8a1.8 1.8 0 0 1-1.57-2.67L7.2 9.5M11 19h8.2a1.8 1.8 0 0 0 1.56-2.67l-1.23-2.12M14 16l-3 3 3 3M8.3 13.6 7.2 9.5l-4.1 1.1M9.34 5.81l1.1-1.89A1.8 1.8 0 0 1 12 3a1.8 1.8 0 0 1 1.53.89l3.94 6.84M13.38 9.63l4.1 1.1 1.1-4.1',
		// A drawing pin seen from the side: the head, the collar, the point.
		pin: 'M9 4h6l-1 5 3 3H7l3-3-1-5zM12 12v8',
		wallet:
			'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h13a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H3M16 12h.01',
		// A gear. What was here was a disc with eight rays coming off it, which is
		// the universal symbol for screen brightness — and it sat in the mobile
		// bar as the way into the account.
		settings:
			'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10.4 3h3.2l.4 2.2 1.7 1 2.1-.7 1.6 2.8-1.7 1.4a6.4 6.4 0 0 1 0 2.6l1.7 1.4-1.6 2.8-2.1-.7-1.7 1-.4 2.2h-3.2l-.4-2.2-1.7-1-2.1.7-1.6-2.8 1.7-1.4a6.4 6.4 0 0 1 0-2.6L4.6 8.3l1.6-2.8 2.1.7 1.7-1z',

		/*
		 * The two kinds of instance, on the screen that chooses between them.
		 *
		 * A phone is a slab with a speaker slot; a server is a box with a rack
		 * light. Deliberately not a cloud — what is on the other end is a
		 * computer somebody runs, and half the time it is theirs.
		 */
		phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 5h4M11 18h2',
		server: 'M4 5h16v6H4zM4 13h16v6H4zM7 8h.01M7 16h.01M11 8h6M11 16h6',
		// things
		calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
		clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
		// A crescent: the end of the day, which is the one reminder that is
		// about a day rather than about a thing in it.
		moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
		tag: 'M4 4h8l8 8-8 8-8-8z M8 8h.01',
		star: 'M12 4l2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7z',
		key: 'M14 7a4 4 0 1 1-3.5 5.9L4 19v-3h3v-3h3l.5-.6A4 4 0 0 1 14 7z',
		link: 'M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7L11 8M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 5.7 5.7L13 16',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
		// A cake with one candle: the only place a birthday is marked, and the
		// one glyph in the set that has to read at 12px beside a date.
		cake: 'M5 21h14v-6H5zM5 15c0-2 1.5-3 3.5-3h7c2 0 3.5 1 3.5 3M12 12V9M12 6.5a1.2 1.2 0 0 1-1-1.8L12 3l1 1.7a1.2 1.2 0 0 1-1 1.8z',
		plug: 'M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0zM12 17v4',
		// A speaker with two waves coming off it: the one shape everybody reads
		// as "this makes a noise".
		sound: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
		// A frame with a hill and a sun in it — the one shape everybody reads as
		// "a picture" at 18 pixels.
		image: 'M4 5h16v14H4zM4 16l4-4 3 3 4-5 5 6M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
		note: 'M5 4h11l3 3v13H5zM8 10h8M8 14h6',
		notebook: 'M7 4h12v17H7zM7 8H4M7 12H4M7 16H4',
		// A fork and a knife: the kitchen, which was borrowing the shopping bag.
		utensils: 'M8 3v8a3 3 0 0 0 6 0V3M11 11v10M17 3c-1.5 2-2 3.5-2 6v3h4V9c0-2.5-.5-4-2-6zM17 12v9',
		flame: 'M12 3c3 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.5 2.5 2 2.5 .5-2-1-5 1-7.5z',
		'sign-out': 'M15 4h5v16h-5M12 8l4 4-4 4M16 12H4',
		// A triangle with a bang in it: the staging band, and anything else that
		// has to be impossible to miss.
		warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
		// A circle with a bang: something went wrong with what you just did.
		error: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v5M12 16h.01',
		// A circle with an i: a quiet aside, not a problem.
		info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01',
		shield: 'M12 3l8 3v6c0 4.4-3.2 7.5-8 9-4.8-1.5-8-4.6-8-9V6z',

		// the help dock, bottom right
		// A keyboard, because the sheet behind this button is a list of keys —
		// a bare "?" said "help of some kind" and there are three kinds now.
		keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
		// A circle with a question in it: the guided tour of whatever is on
		// screen. Distinct from `info`, which is an aside rather than an offer.
		help: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9.6 9.8A2.5 2.5 0 0 1 14.5 11c0 1.7-2.2 2-2.2 3.3M12 17h.01',
		// The same circle as `help`, with a bang in it: "something here is
		// wrong" sits beside "how does this work" and has to read as its sibling.
		bug: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v5M12 16h.01',
		// Paying for any of this, which is a gift rather than a bill: the app
		// is free and stays free, and somebody who wants to keep it that way
		// reaches for a heart.
		heart: 'M12 20S4 15 4 9.5A4 4 0 0 1 12 7a4 4 0 0 1 8 2.5C20 15 12 20 12 20z',
		// An open book: the documentation, which is a different thing from the
		// tour — the tour is this screen, the book is everything.
		book: 'M12 6c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2zM12 6v13',

		/*
		 * GitHub's own mark, filled, because that is the only shape it is.
		 * Drawn on the same 24×24 grid as everything else here so it lines up
		 * with the words beside it.
		 */
		github:
			'M12 2C6.48 2 2 6.58 2 12.23c0 4.51 2.87 8.34 6.84 9.69.5.1.68-.22.68-.49 0-.24-.01-.89-.01-1.74-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.06 10.06 0 0 0 22 12.23C22 6.58 17.52 2 12 2z'
	} as const;

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	let {
		name,
		size = 16,
		/** Icons beside text are decoration; an icon-only control needs a label. */
		label = '',
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		label?: string;
		class?: string;
	} = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="square"
	stroke-linejoin="miter"
	class="inline-block shrink-0 {klass}"
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<path
		d={ICONS[name]}
		fill={FILLED[name] ? 'currentColor' : 'none'}
		stroke={FILLED[name] ? 'none' : 'currentColor'}
	/>
</svg>
