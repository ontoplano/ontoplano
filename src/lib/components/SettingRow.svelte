<script lang="ts">
	/**
	 * One setting: what it is on the left, the control that answers it on the
	 * right.
	 *
	 * The same row on every settings screen, so a label and its control line up
	 * down the page rather than each section choosing a width for itself. On a
	 * phone the control drops under the words — a select beside two lines of
	 * explanation squeezes the sentence into a column three words wide.
	 *
	 * `wide` is for the control that is itself the content — a strip of choices,
	 * a list to reorder: it takes the whole width under the words at any size.
	 * `children` is anything that belongs to the words rather than to the
	 * control: a status line, a note that appears after pressing.
	 */
	import type { Snippet } from 'svelte';

	let {
		label,
		hint = '',
		wide = false,
		dataTour = '',
		control,
		children
	}: {
		label: string;
		hint?: string;
		wide?: boolean;
		dataTour?: string;
		control?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div class="setting-row" class:is-wide={wide} data-tour={dataTour || undefined}>
	<div class="setting-row-text">
		<h3 class="text-sm font-medium text-gray-900">{label}</h3>
		{#if hint}
			<p class="mt-0.5 max-w-2xl text-sm whitespace-pre-line text-gray-500">{hint}</p>
		{/if}
		{@render children?.()}
	</div>
	{#if control}
		<div class="setting-row-control">{@render control()}</div>
	{/if}
</div>

<style>
	/*
	 * Side by side while both fit, and the control wraps under the words — still
	 * at the right — when they do not. A switch or a small button stays beside
	 * its sentence on a phone; a select wider than what is left goes under it.
	 */
	.setting-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0 !important;
	}

	.setting-row-text {
		min-width: 0;
		flex: 1 1 10rem;
	}

	.setting-row-control {
		display: flex;
		flex: 0 1 auto;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-left: auto;
		max-width: 100%;
	}

	.setting-row.is-wide {
		flex-direction: column;
		align-items: stretch;
	}

	.setting-row.is-wide .setting-row-text {
		flex: none;
	}

	.setting-row.is-wide .setting-row-control {
		justify-content: flex-start;
		margin-left: 0;
	}
</style>
