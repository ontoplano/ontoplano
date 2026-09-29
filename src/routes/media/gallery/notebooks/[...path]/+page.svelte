<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { NOTEBOOK_SEPARATOR } from '$lib/notebook-path';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import AlbumCard from '$lib/components/AlbumCard.svelte';
	import MediaTiles from '$lib/components/MediaTiles.svelte';

	const t = useT();

	/**
	 * Every picture that is in a notebook, arranged the way the notebooks are.
	 *
	 * The same screen as any other album — folders above, a grid below, a
	 * picture opens — with one difference that is not cosmetic: nothing here
	 * can be changed. A picture is in this album because a note's markdown
	 * points at it, so there is nothing to move, nothing to remove, and nothing
	 * to upload into. Editing the note is how a picture arrives or leaves, and
	 * that is a better place for it than a gallery screen that would have to
	 * invent which note to write to.
	 */
	let { data }: { data: PageServerData } = $props();

	/** Where a folder's link goes: one segment per level of the notebook. */
	const linkTo = (name: string) =>
		`${resolve('/media/gallery')}/notebooks/${name
			.split(NOTEBOOK_SEPARATOR)
			.map(encodeURIComponent)
			.join('/')}`;

	let viewingId: number | null = $state(null);
	const viewing = $derived(
		viewingId === null ? null : (data.pictures.find((p) => p.id === viewingId) ?? null)
	);
</script>

<PageTitle parts={t('gallery.notebooks.path.pictures', { title: data.title })} />

<!-- One surface, the same shape an album has: where you are along the top,
     then the folders and the pictures. -->
<RoomSurface>
	{#snippet tools()}
		<!-- The notebook's name and the way up are the room bar's. -->
		<div class="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
			<!-- Only a count of what is on this page: pictures in the folders below
			     are counted on their own tiles. -->
			{#if data.pictures.length > 0}
				<span class="tabular shrink-0 text-xs text-gray-500">
					{t('gallery.picturesCount', { count: data.pictures.length })}
				</span>
			{/if}
			<p class="text-xs text-gray-500">
				{t('gallery.notebooks.path.thePicturesInYourNotebooks')}
			</p>
		</div>
	{/snippet}

	{#if data.folders.length > 0}
		<MediaTiles class={data.pictures.length > 0 ? 'border-b border-gray-200' : ''}>
			{#each data.folders as folder (folder.name)}
				<!-- The folder wears what is in it, like every other album tile. -->
				<AlbumCard
					href={linkTo(folder.name)}
					name={folder.name}
					title={folder.leaf}
					coverId={folder.coverId}
					count={folder.totalCount}
				/>
			{/each}
		</MediaTiles>
	{/if}

	{#if data.pictures.length === 0 && data.folders.length === 0}
		<EmptyState
			icon="notebook"
			title={t('gallery.notebooks.path.noPicturesInYourNotebooks')}
			description={t('gallery.notebooks.path.putAPictureInA')}
		/>
	{:else if data.pictures.length > 0}
		<MediaTiles kind="pictures">
			{#each data.pictures as picture (picture.id)}
				<li>
					<button
						class="block w-full overflow-hidden"
						aria-label={picture.alt || picture.filename || t('gallery.notebooks.path.aPicture')}
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

<Modal
	open={viewing !== null}
	title={viewing?.alt || viewing?.filename || t('gallery.notebooks.path.aPicture')}
	onclose={() => (viewingId = null)}
>
	{#if viewing}
		<img src="/media/{viewing.id}" alt={viewing.alt} class="max-h-[70vh] w-full object-contain" />
		{#if viewing.tags.length > 0}
			<p class="mt-2 flex flex-wrap gap-2">
				{#each viewing.tags as tag (tag)}
					<TagChip name={tag} />
				{/each}
			</p>
		{/if}
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (viewingId = null)}>{t('ui.close')}</button>
	{/snippet}
</Modal>
