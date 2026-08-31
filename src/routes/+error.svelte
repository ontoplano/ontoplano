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
	 * Only a failure in the browser is worth offering to send.
	 *
	 * A server error is already in the log, with the id below beside it — asking
	 * for it again would collect nothing new. A crash in the page leaves nothing
	 * anywhere, and the window listener that normally catches one never fires
	 * for an error the router itself turned into this page.
	 */
	const offerReport = $derived(!id && page.status !== 404 && consent !== 'off' && consent !== 'no');

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
						message: page.error?.message ?? `Status ${page.status}`,
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

<div class="mx-auto max-w-md px-6 py-16 text-center">
	<p class="tabular text-5xl font-bold text-gray-900">{page.status}</p>

	<p class="mt-3 text-sm text-gray-700">
		{page.error?.message ?? 'Something went wrong.'}
	</p>

	{#if page.status === 404}
		<p class="mt-2 text-sm text-gray-500">
			That page is not here. It may have been renamed, or never existed.
		</p>
	{/if}

	{#if id}
		<p class="mt-4 text-xs text-gray-500">
			If you report this, quote <code class="rounded bg-gray-100 px-1 text-gray-700">{id}</code>. It
			points at the exact line in the log.
		</p>
	{:else if offerReport}
		<p class="mt-4 text-xs text-gray-500">
			{#if sent}
				Sent. Only what broke went — never what you wrote.
			{:else if failed}
				That could not be sent either.
			{:else}
				<button type="button" class="underline underline-offset-2" onclick={send}>
					Send the technical details
				</button>
				so this can be fixed. Only what broke is sent.
			{/if}
		</p>
	{/if}

	<a href={resolve('/')} class="btn btn-sm mt-6 inline-flex">Back to today</a>
</div>
