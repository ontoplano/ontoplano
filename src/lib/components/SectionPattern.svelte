<script lang="ts">
	import { ICONS, type IconName } from './Icon.svelte';

	/**
	 * The section's glyph, tiled behind the page.
	 *
	 * A room, not a poster: at five percent it reads as texture and you stop
	 * seeing it while you work, but moving from the diary to the planner feels
	 * like moving somewhere. It takes the section colour from `--section-accent`
	 * so it changes with the nav tab and never needs its own palette.
	 *
	 * Drawn as an SVG `<pattern>` rather than a CSS background image: the CSP
	 * allows `data:` for images, but an inline pattern needs no encoding, scales
	 * without a second asset, and inherits `currentColor`.
	 */
	let { icon, size = 260 }: { icon: IconName; size?: number } = $props();

	// Two glyphs per tile, staggered and slightly turned. A single glyph on a
	// square grid reads as wallpaper; off the grid and off the horizontal, it
	// reads as texture and stops asking to be looked at.
	const half = $derived(size / 2);
</script>

<svg class="section-pattern" aria-hidden="true">
	<defs>
		<pattern id="section-glyphs" width={size} height={size} patternUnits="userSpaceOnUse">
			<g
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="square"
				stroke-linejoin="miter"
			>
				<path
					d={ICONS[icon]}
					transform="translate({half * 0.2}, {half * 0.16}) rotate(-8) scale(2.6)"
				/>
				<path
					d={ICONS[icon]}
					transform="translate({half * 1.15}, {half * 1.1}) rotate(6) scale(2.2)"
				/>
			</g>
		</pattern>
	</defs>
	<rect width="100%" height="100%" fill="url(#section-glyphs)" />
</svg>
