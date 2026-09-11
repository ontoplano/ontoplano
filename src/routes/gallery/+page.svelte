<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showNew = $state(false);
	let renaming: (typeof data.albums)[number] | null = $state(null);
	let confirmingDelete: (typeof data.albums)[number] | null = $state(null);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Gallery</h1>
		<button class="btn btn-primary btn-sm" onclick={() => (showNew = true)}>
			<Icon name="plus" /> New album
		</button>
	</div>

	{#if data.albums.length === 0}
		<EmptyState
			icon="image"
			title="No albums yet"
			description="An album is where pictures live. Make one, and putting the same picture in a second album never copies it — a picture lives once, however many albums hold it."
		/>
	{:else}
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each data.albums as album (album.id)}
				<li class="group relative">
					<a
						href="{resolve('/gallery')}/{album.id}"
						class="block overflow-hidden rounded-lg border border-gray-200"
					>
						<span class="block aspect-square bg-gray-50">
							{#if album.coverId}
								<img
									src="/media/{album.coverId}"
									alt=""
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							{:else}
								<span class="flex h-full w-full items-center justify-center text-gray-300">
									<Icon name="image" size={40} />
								</span>
							{/if}
						</span>
						<span class="flex items-baseline justify-between gap-2 px-2.5 py-2">
							<span class="truncate text-sm font-medium text-gray-900">{album.name}</span>
							<span class="shrink-0 text-xs text-gray-500 tabular-nums">{album.count}</span>
						</span>
					</a>
					<span class="absolute top-1.5 right-1.5 flex gap-1">
						<button
							class="icon-btn bg-white/80"
							aria-label="Rename {album.name}"
							onclick={() => (renaming = album)}
						>
							<Icon name="edit" />
						</button>
						<button
							class="icon-btn bg-white/80"
							aria-label="Delete {album.name}"
							onclick={() => (confirmingDelete = album)}
						>
							<Icon name="trash" />
						</button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Modal bind:open={showNew} error={form?.message} title="New album" size="sm">
	<form
		id="album-form"
		method="post"
		action="?/create"
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') showNew = false;
				return update({ reset: result.type === 'success' });
			}}
	>
		<label class="block text-sm">
			<span class="text-gray-600">Name</span>
			<OneLine name="heading" placeholder="Trips" class="input mt-1 w-full" required autofocus />
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (showNew = false)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="album-form">Create</button>
	{/snippet}
</Modal>

<Modal
	open={renaming !== null}
	error={form?.message}
	title="Rename album"
	onclose={() => (renaming = null)}
	size="sm"
>
	<form
		id="rename-form"
		method="post"
		action="?/rename"
		use:enhance={() =>
			({ result, update }) => {
				if (result.type === 'success') renaming = null;
				return update();
			}}
	>
		<input type="hidden" name="id" value={renaming?.id} />
		<label class="block text-sm">
			<span class="text-gray-600">Name</span>
			<OneLine name="heading" value={renaming?.name ?? ''} class="input mt-1 w-full" required />
		</label>
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (renaming = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="rename-form">Save</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingDelete !== null}
	title="Delete this album?"
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.name}</strong> lets go of its {confirmingDelete.count} pictures. A picture
			that also lives in another album stays there; one that lived only here is deleted with it.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}>Keep it</button>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>Delete</button>
		</form>
	{/snippet}
</Modal>
