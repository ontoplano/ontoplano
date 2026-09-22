<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * A paragraph that folds itself when it is long.
	 *
	 * A notebook's description sits above everything the notebook is for, and
	 * one written properly — what the renovation covers, which flat, the
	 * measurements — pushes the notes off the screen on a phone. Clamping it
	 * gives the top of the page back without taking the words away.
	 *
	 * The control appears only when there is something to unfold: a one-line
	 * description with "Show more" under it is a button that does nothing, and
	 * a page of those reads as clutter rather than as an offer.
	 */
	let {
		text,
		/** How many lines to show while it is folded. */
		lines = 2,
		class: klass = ''
	}: { text: string; lines?: number; class?: string } = $props();

	let open = $state(false);
	let box = $state<HTMLParagraphElement>();
	let overflows = $state(false);

	/*
	 * Measured rather than guessed from the length of the string: whether three
	 * lines fit depends on the width of the page and the size of the type, and
	 * a character count is wrong on both counts at every breakpoint.
	 */
	$effect(() => {
		// Named so the effect re-runs when either changes.
		void text;
		void lines;
		const el = box;
		if (!el) return;

		const measure = () => {
			if (open) return;
			overflows = el.scrollHeight - el.clientHeight > 1;
		};
		measure();

		const watcher = new ResizeObserver(measure);
		watcher.observe(el);
		return () => watcher.disconnect();
	});

	const t = useT();
</script>

<div class={klass}>
	<p
		bind:this={box}
		class="max-w-prose text-sm whitespace-pre-line text-gray-500"
		style={open
			? ''
			: `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${lines}; overflow: hidden;`}
	>
		{text}
	</p>
	{#if overflows}
		<button
			type="button"
			class="mt-0.5 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
			{open ? t('ui.showLess') : t('ui.showMore')}
		</button>
	{/if}
</div>
