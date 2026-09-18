<script lang="ts">
	/**
	 * A share of a whole, drawn as a ring.
	 *
	 * A ring rather than a filled circle: the middle is where the total goes,
	 * and a number in the middle is the one fact a pie is otherwise bad at —
	 * "seven hours, and here is how they split" answers both questions at once.
	 *
	 * Drawn with `stroke-dasharray` on one circle per slice rather than with
	 * arc paths: an arc needs trigonometry and a large-arc flag, and gets the
	 * 100%-of-one-category case wrong (the start and end points coincide, so
	 * the arc collapses). A dashed stroke has neither problem, and a single
	 * slice is simply a full circle.
	 *
	 * Slices smaller than a degree are not drawn. They are invisible either
	 * way, and drawing them stacks hairlines on the same pixel.
	 */
	let {
		slices,
		total,
		label = '',
		size = 132
	}: {
		slices: { name: string; value: number; color: string }[];
		/** What the ring adds up to; the middle reads it. */
		total?: number;
		/** What the middle says, already formatted. */
		label?: string;
		size?: number;
	} = $props();

	/** The geometry. One circle, stroked, with the hole left in the middle. */
	const RADIUS = 60;
	const THICKNESS = 22;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	/** Under this share a slice is thinner than a line, so it is left out. */
	const TOO_THIN = 1 / 360;

	const sum = $derived(total ?? slices.reduce((all, one) => all + one.value, 0));

	const drawn = $derived.by(() => {
		if (sum <= 0) return [];
		let turned = 0;
		return slices
			.filter((slice) => slice.value / sum >= TOO_THIN)
			.map((slice) => {
				const share = slice.value / sum;
				const arc = { ...slice, length: share * CIRCUMFERENCE, offset: -turned * CIRCUMFERENCE };
				turned += share;
				return arc;
			});
	});
</script>

<svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={label || undefined}>
	<!-- The track, so a ring that does not add up to its total still reads as a
	     ring rather than as a few floating arcs. -->
	<circle
		cx="80"
		cy="80"
		r={RADIUS}
		fill="none"
		stroke="var(--color-gray-200)"
		stroke-width={THICKNESS}
	/>
	{#each drawn as slice (slice.name)}
		<circle
			cx="80"
			cy="80"
			r={RADIUS}
			fill="none"
			stroke={slice.color}
			stroke-width={THICKNESS}
			stroke-dasharray="{slice.length} {CIRCUMFERENCE}"
			stroke-dashoffset={slice.offset}
			transform="rotate(-90 80 80)"
		>
			<title>{slice.name}</title>
		</circle>
	{/each}
	{#if label}
		<text
			x="80"
			y="80"
			text-anchor="middle"
			dominant-baseline="central"
			class="fill-gray-900 text-[1.4rem] font-semibold"
		>
			{label}
		</text>
	{/if}
</svg>
