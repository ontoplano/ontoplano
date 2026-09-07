<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/**
	 * When something breaks.
	 *
	 * SvelteKit's default is a bare status code on a white page, which tells
	 * somebody nothing and tells us less. The id is the point: it is written into
	 * the server log beside the stack, so "it broke and it said a3f9c1" is a
	 * search rather than a conversation.
	 *
	 * There is no reassurance here on purpose. This page cannot know whether the
	 * thing being written was saved, so it must not say it was.
	 */
	const id = $derived((page.error as { id?: string } | null)?.id);

	const consent = $derived(
		(page.data as { clientErrorReports?: 'off' | 'ask' | 'yes' | 'no' }).clientErrorReports ?? 'off'
	);

	/**
	 * A button, on every kind of failure this page can show.
	 *
	 * A server error is already in the log and the report adds little — but the
	 * alternative on offer was a hexadecimal id and the instruction to quote it,
	 * which is asking somebody to be a courier for a string they cannot read.
	 * The id travels inside the report instead, and the person presses one
	 * thing. A crash in the page has nothing in any log, and the window listener
	 * that normally catches one never fires for an error the router turned into
	 * this page, so there the report is the only record there will ever be.
	 */
	const offerReport = $derived(page.status !== 404 && consent !== 'off' && consent !== 'no');

	let sent = $state(false);
	let failed = $state(false);

	async function send() {
		try {
			const res = await fetch('/api/client-errors', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					// `once`: this click is the permission, and it does not change
					// the standing answer in Preferences either way.
					once: true,
					error: {
						// The id goes with it, so nobody has to carry it by hand.
						message: id
							? `${page.error?.message ?? `Status ${page.status}`} [${id}]`
							: (page.error?.message ?? `Status ${page.status}`),
						stack: (page.error as { stack?: string } | null)?.stack,
						url: location.pathname
					}
				})
			});
			if (!res.ok) throw new Error(String(res.status));
			sent = true;
		} catch {
			failed = true;
		}
	}

	// A standing yes is a yes here too — there is nothing to ask.
	$effect(() => {
		if (offerReport && consent === 'yes' && !sent && !failed) void send();
	});
</script>

<svelte:head><title>{page.status} · ontoplano</title></svelte:head>

<!--
	Centred in what is left of the screen, at a size somebody can read.

	It used to be a small block of 12px and 14px text at the top of a tall empty
	page: on a phone that is a paragraph of fine print above six hundred pixels of
	nothing, and the page scrolls for no reason. The type is the page's ordinary
	reading size now, and the block sits in the middle of the space it has.
-->
<div class="flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center">
	<p class="tabular text-6xl font-bold text-gray-900">{page.status}</p>

	<p class="mt-4 max-w-sm text-base text-gray-700">
		{page.error?.message ?? 'Something went wrong.'}
	</p>

	{#if page.status === 404}
		<p class="mt-2 max-w-sm text-base text-gray-500">
			That page is not here. It may have been renamed, or never existed.
		</p>
	{/if}

	{#if offerReport}
		<div class="mt-6 max-w-sm">
			{#if sent}
				<p class="text-sm text-gray-500">Sent. Only what broke went — never what you wrote.</p>
			{:else if failed}
				<p class="text-sm text-gray-500">That could not be sent either.</p>
			{:else}
				<!-- A button, not an underlined phrase inside a sentence: this is the
				     one thing to do on this page and a thumb has to find it. -->
				<button type="button" class="btn" onclick={send}>Report this error</button>
				<p class="mt-2 text-sm text-gray-500">Only what broke is sent, never what you wrote.</p>
			{/if}
		</div>
	{/if}

	<a href={resolve('/')} class="btn btn-primary mt-8 inline-flex">Back to today</a>
</div>
