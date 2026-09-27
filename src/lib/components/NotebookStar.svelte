<script lang="ts">
	/**
	 * The star that keeps a notebook at the front of the shelf.
	 *
	 * On the shelf's covers and on the notebook's own page, posting to the same
	 * `setFavourite` action — see `routes/notebooks/actions.ts`. The star is the
	 * reader's, so it is offered on a notebook shared with them too.
	 */
	import { enhance } from '$lib/enhance';
	import Icon from './Icon.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		notebook,
		/** `icon-btn` on a cover, `btn btn-sm` in a page header. */
		kind = 'icon-btn',
		tour = false
	}: {
		notebook: { id: number; title: string; favourite: boolean };
		kind?: 'icon-btn' | 'btn btn-sm';
		/** Whether this one is the tutorial's anchor. */
		tour?: boolean;
	} = $props();

	const named = $derived(
		notebook.favourite
			? t('notebooks.removeNamedFromFavourites', { title: notebook.title })
			: t('notebooks.addNamedToFavourites', { title: notebook.title })
	);
	const label = $derived(
		notebook.favourite ? t('notebooks.removeFromFavourites') : t('notebooks.addToFavourites')
	);
</script>

<form
	method="post"
	action="?/setFavourite"
	use:enhance={() =>
		async ({ update }) => {
			await update({ reset: false });
		}}
>
	<input type="hidden" name="id" value={notebook.id} />
	<input type="hidden" name="favourite" value={notebook.favourite ? 'false' : 'true'} />
	<!-- The anchor written out literally, so the tour's check can find it. -->
	{#if tour}
		<button
			class="{kind} notebook-star"
			class:is-on={notebook.favourite}
			title={label}
			aria-label={named}
			aria-pressed={notebook.favourite}
			data-tour="notebook-favourite"
		>
			<Icon name="star" />
		</button>
	{:else}
		<button
			class="{kind} notebook-star"
			class:is-on={notebook.favourite}
			title={label}
			aria-label={named}
			aria-pressed={notebook.favourite}
		>
			<Icon name="star" />
		</button>
	{/if}
</form>

<style>
	/* Filled when it is on: the same outline, so the button does not change size. */
	.notebook-star.is-on :global(path) {
		fill: currentColor;
	}
</style>
