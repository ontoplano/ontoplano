<script lang="ts">
	/**
	 * The section's colour, as a grain behind the page.
	 *
	 * It was the room's glyph tiled at five percent — two of them per tile,
	 * staggered and turned so it would read as texture rather than wallpaper.
	 * It never did. At any size that was visible it was a scattering of
	 * recognisable objects floating behind the work, and the things standing on
	 * it read as loose cards drifting over a pattern rather than as a room:
	 * "you know how we have these fucking icons floating around? I think this
	 * is what is bothering me so much."
	 *
	 * So it is a grain now — the tooth of paper, near enough to sandpaper to
	 * have no shape of its own. It still takes the section colour from
	 * `--section-accent`, so moving from the diary to the planner still feels
	 * like moving somewhere, and it is the one thing on the screen with nothing
	 * to look at.
	 *
	 * `feTurbulence` rather than a tiled image: it is a few hundred bytes, it
	 * cannot repeat visibly because there is nothing in it to repeat, and it
	 * needs no second asset at any density. The filter runs once per page.
	 */
	let {
		/**
		 * How fine the grain is. Higher is finer — this is the frequency the
		 * noise is generated at, in turns per pixel.
		 *
		 * `0.9` is about the tooth of paper at a normal viewing distance: coarse
		 * enough to be a surface rather than a haze, fine enough that no
		 * individual speck is a thing you can point at.
		 */
		grain = 0.9,
		/** How much of it there is. Enough to be a surface, not enough to read. */
		weight = 0.5
	}: { grain?: number; weight?: number } = $props();
</script>

<svg class="section-pattern" aria-hidden="true">
	<defs>
		<filter id="section-grain" x="0" y="0" width="100%" height="100%">
			<!--
				Fractal rather than plain turbulence: plain noise at one frequency
				has a visible weave to it, and the sum of a few octaves is what
				makes a surface look like a material instead of like static.
			-->
			<feTurbulence
				type="fractalNoise"
				baseFrequency={grain}
				numOctaves="3"
				stitchTiles="stitch"
				result="noise"
			/>
			<!--
				The noise is grey; this takes its lightness as an alpha and paints
				the section's own colour through it, so the grain is the room's
				colour rather than a grey veil over it.
			-->
			<feColorMatrix
				in="noise"
				type="matrix"
				values="0 0 0 0 0
				        0 0 0 0 0
				        0 0 0 0 0
				        1 0 0 0 0"
				result="alpha"
			/>
			<feComposite in="SourceGraphic" in2="alpha" operator="in" />
		</filter>
	</defs>
	<rect
		width="100%"
		height="100%"
		fill="currentColor"
		filter="url(#section-grain)"
		opacity={weight}
	/>
</svg>
