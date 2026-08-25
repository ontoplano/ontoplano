<script lang="ts">
	/**
	 * A failed submission's message, on the page.
	 *
	 * It hides itself while a dialog is open, because the dialog shows the same
	 * message and the page behind it is dimmed and inert — two copies of one
	 * error, one of them unreadable, which is worse than either alone.
	 */
	let { message = null }: { message?: string | null } = $props();

	let dialogOpen = $state(false);

	$effect(() => {
		const check = () => (dialogOpen = !!document.querySelector('dialog[open]'));
		check();

		// `open` is an attribute, so the only reliable signal is watching for it.
		const observer = new MutationObserver(check);
		observer.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ['open'],
			childList: true
		});

		return () => observer.disconnect();
	});
</script>

{#if message && !dialogOpen}
	<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>
{/if}
