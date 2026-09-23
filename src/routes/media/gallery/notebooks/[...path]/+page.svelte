<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { NOTEBOOK_SEPARATOR } from '$lib/notebook-path';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

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

	/** The way up: the notebook above this one, or the album itself. */
	const upTo = $derived.by(() => {
		const parts = data.path ? data.path.split(NOTEBOOK_SEPARATOR) : [];
		parts.pop();
		return parts.length > 0
			? linkTo(parts.join(NOTEBOOK_SEPARATOR))
			: data.path
				? `${resolve('/media/gallery')}/notebooks`
				: resolve('/media/gallery');
	});

	let viewingId: number | null = $state(null);
	const viewing = $derived(
		viewingId === null ? null : (data.pictures.find((p) => p.id === viewingId) ?? null)
	);
</script>

<svelte:head
	><title>{t('gallery.notebooks.path.pictures', { title: data.title })}</title></svelte:head
>

<div class="space-y-4">
	<RoomBar title={data.title} back={upTo} backLabel="Back">
		{#snippet actions()}
			<span class="text-sm text-gray-500 tabular-nums">{data.pictures.length}</span>
		{/snippet}
	</RoomBar>

	<p class="text-xs text-gray-500">
		{t('gallery.notebooks.path.thePicturesInYourNotebooks')}
	</p>

	{#if data.folders.length > 0}
		<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
			{#each data.folders as folder (folder.name)}
				<li>
					<!-- `linkTo` starts from resolve('/media/gallery') and appends the
					     notebook's own segments. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={linkTo(folder.name)} class="block">
						<span class="block aspect-square overflow-hidden rounded bg-gray-50">
							<!--
								The folder wears what is in it, like every other album tile.
								The notebook glyph belongs on the one card at /gallery that
								stands for all of this — there it says what kind of thing you
								are about to open; here it would only repeat the shape.
							-->
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
								{folder.leaf}
							</span>
							<span class="text-xs text-gray-500 tabular-nums">{folder.totalCount}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.pictures.length === 0 && data.folders.length === 0}
		<EmptyState
			icon="notebook"
			title={t('gallery.notebooks.path.noPicturesInYourNotebooks')}
			description={t('gallery.notebooks.path.putAPictureInA')}
		/>
	{:else if data.pictures.length > 0}
		<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
			{#each data.pictures as picture (picture.id)}
				<li>
					<button
						class="block w-full overflow-hidden rounded"
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
		</ul>
	{/if}
</div>

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
