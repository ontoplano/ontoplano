<script lang="ts">
	import { enhance } from '$lib/enhance';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import TagRows from '$lib/components/TagRows.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import type { PlainKey } from '$lib/i18n/keys';
	import TagFields from '$lib/components/TagFields.svelte';
	import { getAction } from '$lib/shortcuts';
	import { useT } from '$lib/i18n';
	import type { PageServerData, ActionData } from './$types';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Label = PageServerData['tags'][number];

	let editingId = $state<number | null>(null);
	/* The two fields of the dialog, held here because one of them can be cleared. */
	let name = $state('');
	let color = $state<string | null>(null);
	let description = $state('');
	/* Nowhere until a key is pressed: a first row wearing the cursor reads as chosen. */
	let selectedIndex = $state(-1);
	let rows = $state<ReturnType<typeof TagRows> | undefined>();
	/** What the search box holds: labels whose word or meaning contains it. */
	let looking = $state('');

	/* A to Z, or the ones doing the most work first — each order's natural way. */
	const ORDERS = ['name', 'uses'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		name: 'ui.name',
		uses: 'notebooks.tags.uses'
	};
	const NATURAL: Record<Order, 'asc' | 'desc'> = { name: 'asc', uses: 'desc' };
	let order = $state<Order>('name');
	let direction = $state<'asc' | 'desc'>(NATURAL.name);

	const shownTags = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		const found = needle
			? data.tags.filter((one) => `${one.name}\n${one.description}`.toLowerCase().includes(needle))
			: data.tags;
		const sign = direction === 'asc' ? 1 : -1;
		const byName = (a: Label, b: Label) => a.name.localeCompare(b.name);
		return [...found].sort((a, b) =>
			order === 'uses' ? sign * (a.uses - b.uses) || byName(a, b) : sign * byName(a, b)
		);
	});

	const editing = $derived(
		editingId ? (data.tags.find((one) => one.id === editingId) ?? null) : null
	);

	function openEdit(tag: Label) {
		editingId = tag.id;
		name = tag.name;
		color = tag.color;
		description = tag.description;
	}

	function closeEdit() {
		editingId = null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			closeEdit();
			rows?.clearConfirm();
			return;
		}

		const action = getAction('/notebooks/tags', e);
		if (action === 'toggle-expand') {
			const tag = shownTags[selectedIndex];
			if (!tag) return;
			e.preventDefault();
			rows?.toggleUses(tag.id);
		}
		if (action === 'edit') {
			const tag = shownTags[selectedIndex];
			if (!tag) return;
			e.preventDefault();
			openEdit(tag);
		}
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			const max = shownTags.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(
				Math.max(selectedIndex + (action === 'navigate-down' ? 1 : -1), 0),
				max
			);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		No second heading: the room's name is above and the Tags tab is lit.
		That this is the account's one vocabulary is said by the tour and by the
		edit dialog, where it matters — not by a paragraph in the toolbar.
	-->
	<RoomSurface>
		{#snippet tools()}
			{#if data.tags.length > 0}
				<FilterBar name="tags" trailing={data.tags.length > 1 ? orderControl : undefined}>
					{#snippet lead()}
						<SearchField bind:value={looking} label={t('notebooks.tags.searchTags')} />
					{/snippet}
					{#snippet count()}
						<ShowingCount
							total={data.tags.length}
							shown={shownTags.length}
							said={(count) => t('notebooks.tags.showingCount', { count })}
						/>
					{/snippet}
				</FilterBar>
			{/if}
		{/snippet}
		{#if data.tags.length === 0}
			<EmptyState
				icon="tag"
				title={t('notebooks.tags.noTagsYet')}
				description={t('notebooks.tags.aTagIsMadeBy')}
			/>
		{:else if shownTags.length === 0}
			<EmptyState filtered onclear={() => (looking = '')} />
		{:else}
			<TagRows
				bind:this={rows}
				tags={shownTags}
				cursor={selectedIndex}
				rail
				deleteAction="?/delete"
				onedit={openEdit}
			/>
		{/if}
	</RoomSurface>
</div>

{#snippet orderControl()}
	<SortControl
		value={order}
		options={ORDERS}
		labels={ORDER_LABELS}
		{direction}
		onpick={(next) => {
			order = next;
			direction = NATURAL[next];
			selectedIndex = -1;
		}}
		onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
		label={t('notebooks.tags.orderTagsBy')}
	/>
{/snippet}

<!--
	Rename and colour in one dialog, because they are the same act: this is
	what the label is. Over the page rather than inside the row, so choosing a
	colour does not push the rest of the list down.
-->
<Modal
	open={editing !== null}
	title={t('notebooks.tags.editTag')}
	description={t('notebooks.tags.renamingOntoAName')}
	size="sm"
	error={form?.message ?? null}
	onclose={closeEdit}
>
	{#if editing}
		<form
			id="tag-form"
			method="post"
			action="?/save"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					closeEdit();
				}}
		>
			<input type="hidden" name="id" value={editing.id} />
			<TagFields bind:name bind:description bind:color was={editing.name} />
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={closeEdit}>{t('ui.cancel')}</button>
		<button type="submit" form="tag-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
