<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const others = $derived(data.albums.filter((a) => a.id !== data.album.id));

	/** Filtering by a tag, the way the diary does. Empty means everything. */
	let filterTag = $state('');
	const shown = $derived(
		filterTag ? data.pictures.filter((p) => p.tags.includes(filterTag)) : data.pictures
	);
	const albumTags = $derived([...new Set(data.pictures.flatMap((p) => p.tags))].sort());

	let uploadForm: HTMLFormElement | undefined = $state();
	let viewingId: number | null = $state(null);
	let confirmingRemoveId: number | null = $state(null);

	// Live lookups, not snapshots: an action refreshes `data`, and the open
	// dialog must say what is true now — "Also in" included.
	const viewing = $derived(
		viewingId === null ? null : (data.pictures.find((p) => p.id === viewingId) ?? null)
	);
	const confirmingRemove = $derived(
		confirmingRemoveId === null
			? null
			: (data.pictures.find((p) => p.id === confirmingRemoveId) ?? null)
	);

	/** Choosing the files is the submit. */
	function filesChosen() {
		uploadForm?.requestSubmit();
	}

	/*
	 * Drag a picture onto another album's chip: held ctrl (or alt) it is
	 * duplicated there — one more reference to the same picture, never a
	 * copy of its bytes — and without a modifier it moves. Mouse only; a
	 * finger uses the picture's own "Add to album" instead, and scrolling
	 * stays a scroll.
	 */
	let dragging: number | null = $state(null);
	let dropTarget: number | null = $state(null);
	let dropForm: HTMLFormElement | undefined = $state();
	let dropAction = $state('?/addTo');
	let dropAlbumId = $state(0);
	let dropMediaId = $state(0);

	function dropOn(albumId: number, event: DragEvent) {
		event.preventDefault();
		if (dragging === null) return;
		dropAction = event.ctrlKey || event.altKey ? '?/addTo' : '?/move';
		dropAlbumId = albumId;
		dropMediaId = dragging;
		dragging = null;
		dropTarget = null;
		// The values above land in the hidden form below; submitting on the
		// next tick lets Svelte write them first.
		setTimeout(() => dropForm?.requestSubmit(), 0);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center gap-3">
		<a href={resolve('/gallery')} class="icon-btn" aria-label="Back to the albums">
			<Icon name="undo" />
		</a>
		<h1 class="min-w-0 flex-1 truncate text-lg font-bold text-gray-900">{data.album.name}</h1>
		<span class="text-sm text-gray-500 tabular-nums">{data.pictures.length}</span>
		<form
			method="post"
			action="?/upload"
			enctype="multipart/form-data"
			bind:this={uploadForm}
			use:enhance
		>
			<label class="btn btn-primary btn-sm cursor-pointer">
				<Icon name="plus" /> Add pictures
				<input
					type="file"
					name="file"
					accept="image/png,image/jpeg,image/gif,image/webp"
					multiple
					class="hidden"
					onchange={filesChosen}
				/>
			</label>
		</form>
	</div>

	{#if form?.message}
		<p class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
			{form.message}
		</p>
	{/if}

	{#if others.length > 0 && data.pictures.length > 0}
		<div class="flex flex-wrap items-center gap-2 text-xs text-gray-500">
			<span>Drag a picture onto an album to move it — hold Ctrl to put it in both:</span>
			{#each others as album (album.id)}
				<span
					role="listitem"
					class="rounded-full border px-2.5 py-1 text-sm transition-colors {dropTarget === album.id
						? 'border-gray-900 bg-gray-100 text-gray-900'
						: 'border-gray-200 text-gray-700'}"
					ondragover={(e) => {
						e.preventDefault();
						dropTarget = album.id;
					}}
					ondragleave={() => (dropTarget = null)}
					ondrop={(e) => dropOn(album.id, e)}
				>
					{album.name}
				</span>
			{/each}
		</div>
	{/if}

	<!-- The diary's own gesture: click a tag to see just it, click it again
	     to let go. In the gallery's colour rather than the diary's. -->
	{#if albumTags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each albumTags as tag (tag)}
				<button
					onclick={() => (filterTag = filterTag === tag ? '' : tag)}
					class="chip {filterTag === tag
						? 'border-fuchsia-700 bg-fuchsia-50 text-fuchsia-800'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					#{tag}
				</button>
			{/each}
		</div>
	{/if}

	{#if data.pictures.length === 0}
		<EmptyState
			icon="image"
			title="Nothing here yet"
			description="Add pictures and they appear in a grid. Up to {data.pictureKilobytes}KB each on this instance."
		/>
	{:else}
		<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
			{#each shown as picture (picture.id)}
				<li>
					<button
						class="block w-full overflow-hidden rounded"
						aria-label={picture.alt || picture.filename || 'A picture'}
						draggable="true"
						ondragstart={() => (dragging = picture.id)}
						ondragend={() => {
							dragging = null;
							dropTarget = null;
						}}
						onclick={() => (viewingId = picture.id)}
					>
						<img
							src="/media/{picture.id}"
							alt={picture.alt}
							loading="lazy"
							class="aspect-square w-full bg-gray-50 object-cover"
						/>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- The hidden form the drop gesture posts through. -->
<form method="post" action={dropAction} bind:this={dropForm} class="hidden" use:enhance>
	<input type="hidden" name="albumId" value={dropAlbumId} />
	<input type="hidden" name="mediaId" value={dropMediaId} />
</form>

<!-- One picture, big, with everything about it. -->
<Modal
	open={viewing !== null}
	title={viewing?.filename || 'Picture'}
	onclose={() => (viewingId = null)}
>
	{#if viewing}
		<div class="space-y-3">
			<img
				src="/media/{viewing.id}"
				alt={viewing.alt}
				class="max-h-[60vh] w-full rounded object-contain"
			/>
			<form method="post" action="?/rename" class="flex items-end gap-2" use:enhance>
				<input type="hidden" name="mediaId" value={viewing.id} />
				<label class="block flex-1 text-sm">
					<span class="text-gray-600">Name</span>
					<OneLine name="heading" value={viewing.filename} class="input mt-1 w-full" required />
				</label>
				<button class="btn btn-sm" type="submit">Save name</button>
			</form>
			{#if viewing.tags.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each viewing.tags as tag (tag)}
						<button
							class="chip"
							onclick={() => {
								filterTag = tag;
								viewingId = null;
							}}
						>
							#{tag}
						</button>
					{/each}
				</div>
			{/if}
			<form method="post" action="?/tag" class="flex items-end gap-2" use:enhance>
				<input type="hidden" name="mediaId" value={viewing.id} />
				<label class="block flex-1 text-sm">
					<span class="text-gray-600">Tags</span>
					<OneLine
						name="tags"
						value={viewing.tags.join(' ')}
						class="input mt-1 w-full"
						placeholder="tags, commas or spaces"
					/>
				</label>
				<button class="btn btn-sm" type="submit">Save tags</button>
			</form>
			{#if others.length > 0}
				<form method="post" action="?/addTo" class="flex items-end gap-2" use:enhance>
					<input type="hidden" name="mediaId" value={viewing.id} />
					<label class="block text-sm">
						<span class="text-gray-600">Also put it in</span>
						<select name="albumId" class="input mt-1 block">
							{#each others as album (album.id)}
								<option value={album.id}>{album.name}</option>
							{/each}
						</select>
					</label>
					<button class="btn btn-sm" type="submit">Add</button>
				</form>
			{/if}
			{#if viewing.albums.length > 1}
				<p class="text-xs text-gray-500">
					Also in: {viewing.albums
						.filter((a) => a.id !== data.album.id)
						.map((a) => a.name)
						.join(', ')}
				</p>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<button
			class="btn btn-danger"
			type="button"
			onclick={() => {
				confirmingRemoveId = viewingId;
				viewingId = null;
			}}
		>
			Remove from this album
		</button>
		<button class="btn" type="button" onclick={() => (viewingId = null)}>Close</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingRemove !== null}
	title="Remove this picture?"
	onclose={() => (confirmingRemoveId = null)}
	size="sm"
>
	{#if confirmingRemove}
		<p class="text-sm text-gray-600">
			{#if confirmingRemove.albums.length > 1}
				It stays in {confirmingRemove.albums
					.filter((a) => a.id !== data.album.id)
					.map((a) => a.name)
					.join(', ')}.
			{:else}
				This is its only album, so the picture is deleted for good.
			{/if}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingRemoveId = null)}>Keep it</button>
		<form
			method="post"
			action="?/remove"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingRemoveId = null;
					return update();
				}}
		>
			<input type="hidden" name="mediaId" value={confirmingRemove?.id} />
			<button class="btn btn-danger" type="submit" use:armed>Remove</button>
		</form>
	{/snippet}
</Modal>
