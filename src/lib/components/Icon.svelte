<script lang="ts" module>
	/**
	 * The icon set.
	 *
	 * Inline paths rather than a package: the CSP forbids external assets, the
	 * app already draws its nav this way, and thirty glyphs is not worth a
	 * dependency that ships to a webview. Drawn on a 24×24 grid, stroked not
	 * filled, so they sit at the weight of the text beside them.
	 *
	 * Emoji are not an option — they are somebody else's typeface, they carry a
	 * colour we did not choose, and they render differently on every platform.
	 */
	export const ICONS = {
		// actions
		plus: 'M12 5v14M5 12h14',
		edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
		trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
		close: 'M6 6l12 12M18 6L6 18',
		check: 'M4 12l5 5L20 6',
		undo: 'M4 10h10a5 5 0 1 1 0 10H9M4 10l4-4M4 10l4 4',
		skip: 'M5 5l9 7-9 7zM18 5v14',
		play: 'M7 4l12 8-12 8z',
		search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4',
		filter: 'M4 5h16l-6 7v6l-4 2v-8z',
		download: 'M12 4v10M8 10l4 4 4-4M5 19h14',
		copy: 'M9 4h9v13M5 8h9v12H5z',
		drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
		more: 'M6 12h.01M12 12h.01M18 12h.01',

		// direction
		'chevron-left': 'M14 6l-6 6 6 6',
		'chevron-right': 'M10 6l6 6-6 6',
		'chevron-down': 'M6 10l6 6 6-6',
		'chevron-up': 'M6 14l6-6 6 6',
		'arrow-right': 'M5 12h14M13 6l6 6-6 6',

		// the sections
		home: 'M3 10.5 12 3l9 7.5V21H3z',
		planner: 'M4 5h16v16H4zM4 9h16M9 9v12M15 9v12',
		goals: 'M12 3v18M4 6h14l-3 4 3 4H4z',
		diary: 'M5 3h14v18H5zM9 3v18M12 8h4M12 12h4',
		ideas: 'M9 21h6M10 18h4M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z',
		health: 'M3 12h4l2 6 4-14 2 8h6',
		shopping: 'M4 7h16l-1.5 12h-13zM9 7V5a3 3 0 0 1 6 0v2',
		// A gear. What was here was a disc with eight rays coming off it, which is
		// the universal symbol for screen brightness — and it sat in the mobile
		// bar as the way into the account.
		settings:
			'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10.4 3h3.2l.4 2.2 1.7 1 2.1-.7 1.6 2.8-1.7 1.4a6.4 6.4 0 0 1 0 2.6l1.7 1.4-1.6 2.8-2.1-.7-1.7 1-.4 2.2h-3.2l-.4-2.2-1.7-1-2.1.7-1.6-2.8 1.7-1.4a6.4 6.4 0 0 1 0-2.6L4.6 8.3l1.6-2.8 2.1.7 1.7-1z',

		// things
		calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
		clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
		tag: 'M4 4h8l8 8-8 8-8-8z M8 8h.01',
		star: 'M12 4l2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7z',
		key: 'M14 7a4 4 0 1 1-3.5 5.9L4 19v-3h3v-3h3l.5-.6A4 4 0 0 1 14 7z',
		link: 'M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7L11 8M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 5.7 5.7L13 16',
		user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
		plug: 'M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0zM12 17v4',
		note: 'M5 4h11l3 3v13H5zM8 10h8M8 14h6',
		notebook: 'M7 4h12v17H7zM7 8H4M7 12H4M7 16H4',
		// A fork and a knife: the kitchen, which was borrowing the shopping bag.
		utensils: 'M8 3v8a3 3 0 0 0 6 0V3M11 11v10M17 3c-1.5 2-2 3.5-2 6v3h4V9c0-2.5-.5-4-2-6zM17 12v9',
		flame: 'M12 3c3 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.5 2.5 2 2.5 .5-2-1-5 1-7.5z',
		'sign-out': 'M15 4h5v16h-5M12 8l4 4-4 4M16 12H4',
		// A triangle with a bang in it. Only for the staging band so far, which
		// is the one message on this app that has to be impossible to miss.
		warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
		shield: 'M12 3l8 3v6c0 4.4-3.2 7.5-8 9-4.8-1.5-8-4.6-8-9V6z'
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
	<path d={ICONS[name]} />
</svg>
