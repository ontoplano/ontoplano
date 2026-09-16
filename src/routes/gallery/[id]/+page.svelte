<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { leafAlbumName } from '$lib/album-path';
	import { SvelteSet } from 'svelte/reactivity';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const others = $derived(data.albums.filter((a) => a.id !== data.album.id));

	/*
	 * The albums a picture can be dropped on, as they belong to each other.
	 *
	 * A flat row of every album in the account wrapped onto three lines and
	 * said nothing about which of them were inside which. Roots, with a
	 * chevron where there is something under them.
	 */
	const opened = new SvelteSet<number>();
	const toggle = (id: number) => {
		if (opened.has(id)) opened.delete(id);
		else opened.add(id);
	};
	const leafName = leafAlbumName;

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
	<!--
		The room's own bar, so this page has the header every other one has:
		it stays at the top with a surface under it while the grid scrolls, and
		the arrow where a room shows its glyph goes back to the albums.
	-->
	<RoomBar title={data.album.name} back={resolve('/gallery')} backLabel="Back to the albums">
		{#snippet actions()}
			<span class="text-sm text-gray-500 tabular-nums">{data.pictures.length}</span>
			<form
				method="post"
				action="?/upload"
				enctype="multipart/form-data"
				bind:this={uploadForm}
				use:enhance
			>
				<label class="btn btn-primary btn-sm cursor-pointer">
					<Icon name="plus" />
					{t('gallery.id.addPictures')}
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
		{/snippet}
	</RoomBar>

	<FormError message={form?.message} />

	{#snippet targets(nodes: PageServerData['tree'], depth: number)}
		{#each nodes as node (node.id)}
			{#if node.id !== data.album.id}
				<span class="flex items-center gap-1" style="padding-left: {depth * 0.75}rem">
					{#if node.children.length > 0}
						<button
							class="icon-btn"
							aria-label={t('gallery.id.whatIsInside', {
								show: opened.has(node.id) ? 'Hide' : 'Show',
								name: node.name
							})}
							aria-expanded={opened.has(node.id)}
							onclick={() => toggle(node.id)}
						>
							<Icon name={opened.has(node.id) ? 'chevron-down' : 'chevron-right'} size={14} />
						</button>
					{:else}
						<span class="size-4 shrink-0"></span>
					{/if}
					<span
						role="listitem"
						class="rounded-full border px-2.5 py-1 text-sm transition-colors {dropTarget === node.id
							? 'border-gray-900 bg-gray-100 text-gray-900'
							: 'border-gray-200 text-gray-700'}"
						ondragover={(e) => {
							e.preventDefault();
							dropTarget = node.id;
						}}
						ondragleave={() => (dropTarget = null)}
						ondrop={(e) => dropOn(node.id, e)}
					>
						{leafName(node.name)}
					</span>
				</span>
			{/if}
			{#if opened.has(node.id)}
				{@render targets(node.children, depth + 1)}
			{/if}
		{/each}
	{/snippet}

	<!--
		Dragging is a mouse, so this is a mouse's row.

		A finger uses the picture's own "Add to album". The test is the pointer,
		not the width: a phone held sideways is a wide screen, and this sentence
		and the chips under it took the top third of one to offer something no
		finger can do.
	-->
	{#if others.length > 0 && data.pictures.length > 0}
		<div class="mouse-only text-xs text-gray-500">
			<p class="mb-1">{t('gallery.id.dragAPictureOntoAn')}</p>
			<div class="flex flex-col gap-1">
				{@render targets(data.tree, 0)}
			</div>
		</div>
	{/if}

	<!--
		The diary's own gesture: click a tag to see just it, click it again to
		let go. In the gallery's colour rather than the diary's.
	-->
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

	<!--
		The folders in this album, above its pictures.
		
		Without these an album was a flat wall and the only way to the folder
		inside it was back out to the index — and the grid below is everything
		beneath this album, so a parent whose pictures all live in subfolders is
		the wall somebody expects rather than an empty page with a count on it.
	-->
	{#if data.folders.length > 0}
		<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
			{#each data.folders as folder (folder.id)}
				<li>
					<a href="{resolve('/gallery')}/{folder.id}" class="block">
						<span class="block aspect-square overflow-hidden rounded bg-gray-50">
							{#if folder.coverId}
								<img
									src="/media/{folder.coverId}"
									alt=""
									loading="lazy"
									class="h-full w-full object-cover"
								/>
							{:else}
								<span class="flex h-full w-full items-center justify-center text-gray-300">
									<Icon name="image" size={32} />
								</span>
							{/if}
						</span>
						<span class="mt-1 flex items-baseline gap-1">
							<span class="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
								{leafName(folder.name)}
							</span>
							<span class="text-xs text-gray-400 tabular-nums">{folder.count}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.pictures.length === 0 && data.folders.length === 0}
		<EmptyState
			icon="image"
			title={t('gallery.id.nothingHereYet')}
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
			<!--
				The name and the description together, because they are saved
				together: one is for finding the picture again, the other is what a
				screen reader says and what stands in when the bytes do not arrive.
			-->
			<form method="post" action="?/rename" class="grid gap-2" use:enhance>
				<input type="hidden" name="mediaId" value={viewing.id} />
				<label class="block text-sm">
					<span class="text-gray-600">{t('ui.name')}</span>
					<OneLine name="heading" value={viewing.filename} class="input mt-1 w-full" required />
				</label>
				<div class="flex items-end gap-2">
					<label class="block flex-1 text-sm">
						<span class="text-gray-600">{t('ui.description')}</span>
						<OneLine
							name="alt"
							value={viewing.alt}
							class="input mt-1 w-full"
							placeholder={t('gallery.id.whatIsInThePicture')}
						/>
					</label>
					<button class="btn btn-sm" type="submit">{t('ui.save')}</button>
				</div>
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
					<span class="text-gray-600">{t('ui.tags')}</span>
					<OneLine
						name="tags"
						value={viewing.tags.join(' ')}
						class="input mt-1 w-full"
						placeholder={t('gallery.id.tagsCommasOrSpaces')}
					/>
				</label>
				<button class="btn btn-sm" type="submit">{t('gallery.id.saveTags')}</button>
			</form>
			{#if others.length > 0}
				<form method="post" action="?/addTo" class="flex items-end gap-2" use:enhance>
					<input type="hidden" name="mediaId" value={viewing.id} />
					<label class="block text-sm">
						<span class="text-gray-600">{t('gallery.id.alsoPutItIn')}</span>
						<select name="albumId" class="select mt-1 block">
							{#each others as album (album.id)}
								<option value={album.id}>{album.name}</option>
							{/each}
						</select>
					</label>
					<button class="btn btn-sm" type="submit">{t('ui.add')}</button>
				</form>
			{/if}
			{#if viewing.albums.length > 1}
				<p class="text-xs text-gray-500">
					{t('gallery.id.alsoIn')}
					{viewing.albums
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
			{t('gallery.id.removeFromThisAlbum')}
		</button>
		<button class="btn" type="button" onclick={() => (viewingId = null)}>{t('ui.close')}</button>
	{/snippet}
</Modal>

<Modal
	open={confirmingRemove !== null}
	title={t('gallery.id.removeThisPicture')}
	onclose={() => (confirmingRemoveId = null)}
	size="sm"
>
	{#if confirmingRemove}
		<p class="text-sm text-gray-600">
			{#if confirmingRemove.albums.length > 1}
				{t('gallery.id.itStaysIn')}
				{confirmingRemove.albums
					.filter((a) => a.id !== data.album.id)
					.map((a) => a.name)
					.join(', ')}.
			{:else}
				{t('gallery.id.thisIsItsOnlyAlbum')}
			{/if}
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingRemoveId = null)}
			>{t('gallery.id.keepIt')}</button
		>
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
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.remove')}</button>
		</form>
	{/snippet}
</Modal>
