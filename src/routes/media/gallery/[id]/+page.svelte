<script lang="ts">
	import TagFilter from '$lib/components/TagFilter.svelte';
	import { tagFilterInUrl } from '$lib/tag-filter-url.svelte';
	import { isTagFiltering, passesTagFilter } from '$lib/tag-filter';
	import { page } from '$app/state';
	import TagInput from '$lib/components/TagInput.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { leafAlbumName } from '$lib/album-path';
	import { SvelteSet } from 'svelte/reactivity';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import AlbumCard from '$lib/components/AlbumCard.svelte';
	import MediaTiles from '$lib/components/MediaTiles.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { browsable } from '$lib/browse.svelte';
	import type { PlainKey } from '$lib/i18n/keys';
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

	/** Filtering by tags, the way the diary does; kept in the address. */
	const tagFilter = tagFilterInUrl();
	let looking = $state('');
	const needle = $derived(looking.trim().toLowerCase());

	/** The server sends the newest first; that order is "added". */
	const ORDERS = ['added', 'name'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		added: 'gallery.id.orderAdded',
		name: 'gallery.id.orderName'
	};
	let order = $state<Order>('added');
	let direction = $state<'asc' | 'desc'>('desc');

	const shown = $derived.by(() => {
		const found = data.pictures.filter(
			(p) =>
				passesTagFilter(p.tags, tagFilter.current) &&
				(needle === '' ||
					(p.filename ?? '').toLowerCase().includes(needle) ||
					(p.alt ?? '').toLowerCase().includes(needle))
		);
		if (order === 'name') {
			const sign = direction === 'asc' ? 1 : -1;
			return found.sort((a, b) => sign * (a.filename ?? '').localeCompare(b.filename ?? ''));
		}
		return direction === 'desc' ? found : found.reverse();
	});
	const narrowed = $derived(needle !== '' || isTagFiltering(tagFilter.current));

	/** A folder's tile counts its whole branch, the way the gallery's cards do. */
	function branchOf(
		id: number,
		nodes: PageServerData['tree'] = data.tree
	): PageServerData['tree'][number] | null {
		for (const node of nodes) {
			if (node.id === id) return node;
			const found = branchOf(id, node.children);
			if (found) return found;
		}
		return null;
	}

	/** j/k across the pictures; Enter opens the one under the cursor. */
	let at = $state(-1);
	browsable(() => ({
		items: () => shown,
		cursor: () => at,
		moveTo: (i) => (at = i),
		open: (i) => (viewingId = shown[i].id)
	}));
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

	let fileInput: HTMLInputElement | undefined = $state();

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({ label: t('gallery.id.addPictures'), run: () => fileInput?.click() }));

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

{#snippet targets(nodes: PageServerData['tree'], depth: number)}
	{#each nodes as node (node.id)}
		{#if node.id !== data.album.id}
			<!-- The chip first and its disclosure after it: a chevron in front of a
			     name read as a breadcrumb. -->
			<span class="flex items-center gap-0.5">
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
				{#if node.children.length > 0}
					<button
						class="icon-btn"
						title={t('gallery.id.whatIsInside', {
							show: opened.has(node.id) ? t('ui.hide') : t('ui.show'),
							name: node.name
						})}
						aria-label={t('gallery.id.whatIsInside', {
							show: opened.has(node.id) ? t('ui.hide') : t('ui.show'),
							name: node.name
						})}
						aria-expanded={opened.has(node.id)}
						onclick={() => toggle(node.id)}
					>
						<Icon
							name="chevron-down"
							size={14}
							class="transition-transform {opened.has(node.id) ? '' : '-rotate-90'}"
						/>
					</button>
				{/if}
			</span>
		{/if}
		{#if opened.has(node.id)}
			{@render targets(node.children, depth + 1)}
		{/if}
	{/each}
{/snippet}

<!--
	One surface: where you are and what narrows it along the top, the albums a
	picture can be dragged to under that, then the folders in this album and
	its pictures.
-->
<RoomSurface>
	{#snippet tools()}
		<!-- The album's name and the way back are the room bar's; the strip is
		     search, count, tags and order, like every other list. -->
		<FilterBar
			name="album"
			on={narrowed}
			onclear={() => {
				looking = '';
				tagFilter.current = { include: [], exclude: [], mode: 'any' };
			}}
		>
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('gallery.id.searchPictures')} />
			{/snippet}
			{#snippet count()}
				<ShowingCount
					total={data.pictures.length}
					shown={shown.length}
					said={(n) => t('gallery.picturesCount', { count: n })}
				/>
			{/snippet}
			{#snippet inline()}
				<!-- The same tag filter the diary and the task list use. -->
				{#if albumTags.length > 0 || isTagFiltering(tagFilter.current)}
					<TagFilter
						tags={albumTags}
						value={tagFilter.current}
						onchange={(next) => (tagFilter.current = next)}
						name="gallery-tags"
					/>
				{/if}
			{/snippet}
			{#snippet trailing()}
				<SortControl
					value={order}
					options={ORDERS}
					labels={ORDER_LABELS}
					{direction}
					onpick={(next) => (order = next)}
					onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
					label={t('gallery.id.orderBy')}
				/>
			{/snippet}
		</FilterBar>
		<!-- The room's verb opens this; the form is what posts the files. -->
		<form
			method="post"
			action="?/upload"
			enctype="multipart/form-data"
			bind:this={uploadForm}
			class="hidden"
			use:enhance
		>
			<input
				bind:this={fileInput}
				type="file"
				name="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				multiple
				onchange={filesChosen}
			/>
		</form>
	{/snippet}

	<FormError message={form?.message} />

	<!--
		Dragging is a mouse, so this is a mouse's row.

		A finger uses the picture's own "Add to album". The test is the pointer,
		not the width: a phone held sideways is a wide screen, and this sentence
		and the chips under it took the top third of one to offer something no
		finger can do.
	-->
	{#if others.length > 0 && data.pictures.length > 0}
		<div class="mouse-only border-b border-gray-200 px-4 py-3 text-xs text-gray-500">
			<p class="mb-2">{t('gallery.id.dragAPictureOntoAn')}</p>
			<div class="flex flex-wrap items-center gap-2">
				{@render targets(data.tree, 0)}
			</div>
		</div>
	{/if}

	<!--
		The folders in this album, above its pictures.

		Without these an album was a flat wall and the only way to the folder
		inside it was back out to the index — and the grid below is everything
		beneath this album, so a parent whose pictures all live in subfolders is
		the wall somebody expects rather than an empty page with a count on it.
	-->
	{#if data.folders.length > 0 && !narrowed}
		<MediaTiles class="border-b border-gray-200">
			{#each data.folders as folder (folder.id)}
				{@const branch = branchOf(folder.id)}
				<AlbumCard
					href="{resolve('/media/gallery')}/{folder.id}"
					name={folder.name}
					title={leafName(folder.name)}
					coverId={folder.coverId}
					count={branch?.totalCount ?? branch?.count ?? folder.count}
					inside={branch?.children.length ?? 0}
				/>
			{/each}
		</MediaTiles>
	{/if}

	{#if data.pictures.length === 0 && data.folders.length === 0}
		<EmptyState
			icon="image"
			title={t('gallery.id.nothingHereYet')}
			description={t('media.gallery.id.addPicturesAppearInGrid', {
				kilobytes: data.pictureKilobytes
			})}
		/>
	{:else if shown.length === 0 && narrowed}
		<EmptyState icon="search" title={t('gallery.id.noneMatch')} />
	{:else if shown.length > 0}
		<MediaTiles kind="pictures">
			{#each shown as picture, i (picture.id)}
				<li data-row use:listCursor={at === i}>
					<button
						class="block w-full overflow-hidden"
						aria-label={picture.alt || picture.filename || t('gallery.id.aPicture')}
						title={picture.filename || undefined}
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
		</MediaTiles>
	{/if}
</RoomSurface>

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
						<TagChip
							name={tag}
							onclick={() => {
								tagFilter.current = { include: [tag], exclude: [], mode: 'any' };
								viewingId = null;
							}}
						/>
					{/each}
				</div>
			{/if}
			<form method="post" action="?/tag" class="flex items-end gap-2" use:enhance>
				<input type="hidden" name="mediaId" value={viewing.id} />
				<label class="block flex-1 text-sm">
					<span class="text-gray-600">{t('ui.tags')}</span>
					<TagInput
						value={viewing.tags.join(', ')}
						known={page.data.tagVocabulary ?? []}
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
					{t('gallery.id.alsoIn', {
						albums: viewing.albums
							.filter((a) => a.id !== data.album.id)
							.map((a) => a.name)
							.join(', ')
					})}
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
				{t('gallery.id.itStaysIn', {
					albums: confirmingRemove.albums
						.filter((a) => a.id !== data.album.id)
						.map((a) => a.name)
						.join(', ')
				})}
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
