<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';

	/**
	 * A failed submission's message, on the page.
	 *
	 * It hides itself while a dialog is open, because the dialog shows the same
	 * message and the page behind it is dimmed and inert — two copies of one
	 * error, one of them unreadable, which is worse than either alone.
	 *
	 * And while one has stepped away (`data-away`, see `Modal`): a dialog saved
	 * from its footer closes before the answer and comes back only for a
	 * refusal — so for the moment between the page's data returning and the
	 * dialog stepping back, nothing was open, and the refusal flashed under the
	 * tabs before the dialog showed it properly.
	 */
	let { message = null }: { message?: string | null } = $props();

	let dialogOpen = $state(false);

	$effect(() => {
		const check = () => (dialogOpen = !!document.querySelector('dialog[open], dialog[data-away]'));
		check();

		// `open` is an attribute, so the only reliable signal is watching for it.
		const observer = new MutationObserver(check);
		observer.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ['open', 'data-away'],
			childList: true
		});

		return () => observer.disconnect();
	});
</script>

{#if message && !dialogOpen}
	<Banner kind="error" {message} />
{/if}
