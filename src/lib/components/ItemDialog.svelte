<script lang="ts">
	/**
	 * A thing in the cupboard, written down or changed, wherever its row is.
	 *
	 * The Inventory room's own dialog, so a notebook's Inventory tab had a
	 * pencil on every row and nothing behind it. One copy, mounted by both
	 * screens; where it posts is `actions` — see `$lib/item-action-names`.
	 * Opened by `openNew` and `edit`.
	 */
	import { enhance } from '$lib/enhance';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PicturePicker from '$lib/components/PicturePicker.svelte';
	import type { ItemActionNames } from '$lib/item-action-names';
	import { storedAttributePairs } from '$lib/attribute-keys';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Item = {
		id: number;
		name: string;
		type: string;
		inventoryCategoryId: number | null;
		notes: string | null;
		priceCents: number | null;
		attributes: string | null;
		locationId: number | null;
		idealQty: number | null;
		notebookId: number | null;
		pictureId: number | null;
		mine: boolean;
	};

	let {
		/** Every thing the screen has, so the open one's picture follows the page. */
		items,
		categories,
		locations,
		notebooks,
		kilobytes,
		actions,
		error = undefined,
		/** Whether it is showing, bound: the room's bar toggles it. */
		open = $bindable(false)
	}: {
		items: Item[];
		categories: { id: number; name: string }[];
		locations: { id: number; name: string; path: string }[];
		notebooks: { id: number; title: string; modules: readonly string[] }[];
		kilobytes: number;
		actions: ItemActionNames;
		error?: string;
		open?: boolean;
	} = $props();

	let editingId: number | null = $state(null);
	let editName = $state('');
	let editInventoryCategoryId: number | null = $state(null);
	let editNotes = $state('');
	let editPrice = $state('');
	/** Only asked when writing something down; an edit leaves it where it is. */
	let newLocationId = $state<number | null>(null);
	/** The thing's own fields, while it is being edited. */
	let editFields = $state<[string, string][]>([]);
	/** The subject it is filed under, so an edit does not take it out of one. */
	let editNotebookId = $state<number | null>(null);
	let editIdealQty = $state('1');
	let newItemType = $state<'replenish' | 'someday'>('replenish');

	/** The thing whose dialog is open, for its picture, which is set apart from the form. */
	const editingItem = $derived(items.find((one) => one.id === editingId) ?? null);

	/** Empties the form, open or not. */
	export function close() {
		editingId = null;
		editName = '';
		editInventoryCategoryId = null;
		editNotes = '';
		editPrice = '';
	}

	/** Where a new thing starts: the drawer, the list and the category on screen. */
	export function openNew(start: {
		locationId: number | null;
		type: 'replenish' | 'someday';
		inventoryCategoryId: number | null;
		notebookId?: number | null;
	}) {
		close();
		editIdealQty = '1';
		// One blank pair, so a thing can be described as it is written down
		// rather than added and then opened again to say what it is.
		editFields = [['', '']];
		newLocationId = start.locationId;
		newItemType = start.type;
		editInventoryCategoryId = start.inventoryCategoryId;
		editNotebookId = start.notebookId ?? null;
		open = true;
	}

	export function edit(item: Item) {
		editingId = item.id;
		editName = item.name;
		newItemType = item.type as 'replenish' | 'someday';
		editInventoryCategoryId = item.inventoryCategoryId;
		editNotes = item.notes ?? '';
		editPrice = item.priceCents === null ? '' : (item.priceCents / 100).toFixed(2);
		// One blank pair at the end, so adding a field is typing rather than
		// finding the button that lets you type.
		editFields = [...storedAttributePairs(item.attributes), ['', '']];
		// Where it lives, on the edit form too: a drag is the quick way and not
		// everybody's way, and on a phone it is not always the possible one.
		newLocationId = item.locationId;
		editIdealQty = String(item.idealQty ?? 1);
		editNotebookId = item.notebookId;
		open = true;
	}
</script>

<!-- Editing happens here too. It used to happen in the row: six controls
     squeezed into a column a quarter of the screen wide, which is what a
     modal is for. -->
<Modal
	bind:open
	{error}
	title={editingId ? t('inventory.editItem') : t('inventory.newItem')}
	onclose={close}
	size="sm"
>
	<!-- Its own form beside the item's, since a file goes up the moment it
	     is chosen. Only on a thing of your own: a shared one's picture is
	     its owner's to choose. -->
	{#if editingItem?.mine}
		<div class="mb-3 flex items-center gap-3">
			<PicturePicker
				id={editingItem.id}
				pictureId={editingItem.pictureId}
				icon="box"
				{kilobytes}
				setAction={actions.setPicture}
				removeAction={actions.removePicture}
				fields={{ title: editingItem.name }}
				chooseLabel={t('inventory.aPictureOf', { name: editingItem.name })}
				changeLabel={t('inventory.changeThePicture')}
				removeLabel={t('inventory.removeThePicture')}
				size="size-16"
				removable
			/>
			<p class="text-xs text-gray-500">
				{editingItem.pictureId
					? t('inventory.pressToChangeIt')
					: t('inventory.pressToChooseAPicture')}
			</p>
		</div>
	{/if}
	<form
		id="item-form"
		method="POST"
		action={editingId ? actions.update : actions.create}
		use:enhance={() => {
			return async ({ update, result }) => {
				await update({ reset: result.type === 'success' });
				if (result.type === 'success') {
					open = false;
					close();
				}
			};
		}}
	>
		{#if editingId}
			<input type="hidden" name="id" value={editingId} />
		{/if}
		<FormGrid>
			<BuyFields
				bind:label={editName}
				bind:notes={editNotes}
				bind:price={editPrice}
				bind:type={newItemType}
				bind:inventoryCategoryId={editInventoryCategoryId}
				bind:locationId={newLocationId}
				bind:fields={editFields}
				bind:idealQty={editIdealQty}
				bind:notebookId={editNotebookId}
				{categories}
				{locations}
				{notebooks}
				askLocation={true}
				showFields
			/>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (open = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="item-form" class="btn btn-primary">
			{editingId ? t('ui.save') : t('inventory.addItem')}
		</button>
	{/snippet}
</Modal>
