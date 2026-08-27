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
	 */
	const id = $derived((page.error as { id?: string } | null)?.id);
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
	{:else}
		<p class="mt-2 text-sm text-gray-500">
			This is our fault rather than yours. Nothing you had written is lost.
		</p>
	{/if}

	{#if id}
		<p class="mt-4 text-xs text-gray-500">
			If you report this, quote <code class="rounded bg-gray-100 px-1 text-gray-700">{id}</code>. It
			points at the exact line in the log.
		</p>
	{/if}

	<a href={resolve('/')} class="btn btn-sm mt-6 inline-flex">Back to today</a>
</div>
