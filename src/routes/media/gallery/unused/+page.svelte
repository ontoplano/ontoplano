<script lang="ts">
	import { enhance } from '$lib/enhance';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import PageTitle from '$lib/components/PageTitle.svelte';
	import MediaTiles from '$lib/components/MediaTiles.svelte';
	import { armed } from '$lib/actions/armed';
	import { listCursor } from '$lib/actions/list-cursor';
	import { browsable } from '$lib/browse.svelte';
	import type { ActionData, PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The pictures nothing points at: pasted into a todo and then cut out of
	 * it, swapped for another, left in a draft that was never saved. Nothing
	 * else in the app reaches them, so this is the one place they can be seen
	 * — and deleted, which is what anybody finding one here wants.
	 */
	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let viewingId: number | null = $state(null);
	const viewing = $derived(
		viewingId === null ? null : (data.pictures.find((p) => p.id === viewingId) ?? null)
	);
	/** The picture whose deleting is being confirmed, or 'all'. */
	let confirming: number | 'all' | null = $state(null);

	/** j/k across the pictures; Enter opens the one under the cursor. */
	let at = $state(-1);
	browsable(() => ({
		items: () => data.pictures,
		cursor: () => at,
		moveTo: (i) => (at = i),
		open: (i) => (viewingId = data.pictures[i].id)
	}));

	const closeAfter =
		() =>
		async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			if (result.type === 'success') {
				confirming = null;
				viewingId = null;
			}
			await update();
		};
</script>

<PageTitle parts={t('gallery.unused.title')} />

<RoomSurface>
	{#snippet tools()}
		<div class="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
			<span class="tabular shrink-0 text-xs text-gray-500">
				{t('gallery.picturesCount', { count: data.pictures.length })}
			</span>
			<p class="min-w-0 flex-1 text-xs text-gray-500">{t('gallery.unused.whatTheseAre')}</p>
			{#if data.pictures.length > 0}
				<button type="button" class="btn btn-sm btn-danger" onclick={() => (confirming = 'all')}>
					<Icon name="trash" />{t('gallery.unused.deleteAll')}
				</button>
			{/if}
		</div>
	{/snippet}

	<FormError message={form?.message} />

	{#if data.pictures.length === 0}
		<EmptyState
			icon="image"
			title={t('gallery.unused.noneTitle')}
			description={t('gallery.unused.noneBody')}
		/>
	{:else}
		<MediaTiles kind="pictures">
			{#each data.pictures as picture, i (picture.id)}
				<li data-row use:listCursor={at === i}>
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
	{/if}
	{#snippet footer()}
		<button
			class="btn btn-danger"
			type="button"
			onclick={() => {
				confirming = viewingId;
				viewingId = null;
			}}><Icon name="trash" />{t('ui.delete')}</button
		>
		<button class="btn" type="button" onclick={() => (viewingId = null)}>{t('ui.close')}</button>
	{/snippet}
</Modal>

<Modal
	open={confirming !== null}
	title={confirming === 'all'
		? t('gallery.unused.deleteAllTitle', { count: data.pictures.length })
		: t('gallery.unused.deleteOneTitle')}
	onclose={() => (confirming = null)}
	size="sm"
>
	<p class="text-sm text-gray-700">{t('gallery.unused.deleteBody')}</p>
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirming = null)}>{t('ui.cancel')}</button>
		<form method="post" action="?/remove" use:enhance={closeAfter}>
			{#each confirming === 'all' ? data.pictures.map((p) => p.id) : confirming === null ? [] : [confirming] as id (id)}
				<input type="hidden" name="mediaId" value={id} />
			{/each}
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>
