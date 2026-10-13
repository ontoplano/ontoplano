<script lang="ts">
	/**
	 * A colour that may also be none: the well, and the button that takes it off.
	 *
	 * A colour input has no empty, so "none" cannot be said with the input
	 * alone. Two forms solved that for themselves — a hidden field the server
	 * reads, the well opening on a neutral grey, a button that empties the
	 * hidden field — and a third was about to. This is that, once: the form
	 * posts `name` as `#rrggbb` or as nothing, and nothing means no colour.
	 *
	 * Whatever shows the colour being worn (a chip, a note's face) is the
	 * caller's, beside it as `children`.
	 */
	import type { Snippet } from 'svelte';
	import ColorWell from '$lib/components/ColorWell.svelte';
	import { TAG_COLOR_DEFAULT } from '$lib/colors';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		name = 'color',
		color = $bindable<string | null>(null),
		/** What the colour is of, for the well's tooltip and screen reader. */
		label,
		/** What the button that takes it off says. */
		noneLabel = undefined,
		/** What the well opens on while there is no colour — a question, not an answer. */
		fallback = TAG_COLOR_DEFAULT,
		children = undefined
	}: {
		name?: string;
		color: string | null;
		label: string;
		noneLabel?: string;
		fallback?: string;
		children?: Snippet;
	} = $props();
</script>

<input type="hidden" {name} value={color ?? ''} />
<div class="flex items-center gap-2">
	<ColorWell bind:value={() => color ?? fallback, (next) => (color = next ?? null)} {label} />
	{@render children?.()}
	<button
		type="button"
		onclick={() => (color = null)}
		disabled={color === null}
		class="btn btn-sm ml-auto"
	>
		{noneLabel ?? t('ui.noColour')}
	</button>
</div>
