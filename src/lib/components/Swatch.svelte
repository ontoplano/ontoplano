<script lang="ts">
	/**
	 * A colour, standing for the thing that wears it.
	 *
	 * A category's spine beside a block, a tag's dot, a ledger's stripe — the
	 * same mark, drawn nine slightly different ways across the app: `h-3 w-1`
	 * here, `h-4 w-1` there, a rounded square in Insights and a rounded bar in
	 * Review. One shape now, in three sizes, so a category looks like itself
	 * wherever it turns up.
	 *
	 * ## Why it has an edge
	 *
	 * The colour is the person's to choose, and some of them land on the
	 * surface they are drawn against: a black category is invisible on the
	 * dark theme, a white one on the light. The hairline is mixed from the
	 * ink rather than from the colour, so it shows exactly where the fill does
	 * not — and disappears into the fill everywhere else.
	 */
	let {
		color,
		/** `bar` beside a row, `dot` in a sentence, `tall` beside a card. */
		shape = 'bar',
		label = '',
		class: klass = ''
	}: {
		color: string;
		shape?: 'bar' | 'dot' | 'tall';
		/** What it stands for, when nothing beside it says so. */
		label?: string;
		class?: string;
	} = $props();
</script>

<span
	class="swatch swatch--{shape} {klass}"
	style="background-color: {color}"
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
></span>

<style>
	.swatch {
		display: inline-block;
		flex: none;
		border-radius: 9999px;
		/* The edge that keeps a black or white choice visible — see above. */
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-gray-500) 45%, transparent);
	}

	.swatch--bar {
		width: 0.25rem;
		height: 0.75rem;
	}

	.swatch--tall {
		width: 0.25rem;
		height: 1rem;
	}

	.swatch--dot {
		width: 0.5rem;
		height: 0.5rem;
	}
</style>
