<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { keepInView } from '$lib/actions/keep-in-view';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { SECTION_COLORS, TAG_COLOR_DEFAULT } from '$lib/colors';
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
	let confirmDelete = $state<number | null>(null);
	let selectedIndex = $state(0);

	const editing = $derived(
		editingId ? (data.tags.find((one) => one.id === editingId) ?? null) : null
	);

	function openEdit(tag: Label) {
		editingId = tag.id;
		name = tag.name;
		color = tag.color;
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
			confirmDelete = null;
			return;
		}

		const action = getAction('/notebooks/tags', e.key);
		if (action === 'edit') {
			const tag = data.tags[selectedIndex];
			if (!tag) return;
			e.preventDefault();
			openEdit(tag);
		}
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			const max = data.tags.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(
				Math.max(selectedIndex + (action === 'navigate-down' ? 1 : -1), 0),
				max
			);
		}
	}
</script>

<svelte:head><title>{t('notebooks.tags.tagsOntoplano')}</title></svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		No second heading: the room's name is above and the Tags tab is lit.
		The description is doing real work, though — this list is not the
		notebooks' tags, and somebody renaming one here is renaming it on their
		week as well.
	-->
	<Card
		description={t('notebooks.tags.oneVocabularyForTheWhole')}
		accent={SECTION_COLORS.diary}
		flush
	>
		{#if data.tags.length === 0}
			<EmptyState
				icon="tag"
				title={t('notebooks.tags.noTagsYet')}
				description={t('notebooks.tags.aTagIsMadeBy')}
			/>
		{:else}
			<div class="divide-y divide-gray-200" data-tour="tag-list">
				{#each data.tags as tag, i (tag.id)}
					<div
						use:keepInView={selectedIndex === i}
						class="list-row {selectedIndex === i ? 'kbd-cursor' : ''}"
					>
						<div class="list-row-main flex min-w-0 items-center gap-3">
							<!-- The label as every other room draws it, so the colour is
							     chosen against the thing it will actually look like. -->
							<TagChip name={tag.name} color={tag.color} class="shrink-0" />
							<span class="min-w-0 text-xs text-gray-500">
								<span class="tabular">{tag.uses}</span>
								{tag.uses === 1
									? t('notebooks.tags.thingCarriesIt')
									: t('notebooks.tags.thingsCarryIt')}
							</span>
						</div>

						<div class="list-row-actions flex-none">
							<button
								title={t('ui.edit')}
								aria-label={t('ui.edit')}
								onclick={() => openEdit(tag)}
								class="icon-btn"
							>
								<Icon name="edit" />
							</button>

							{#if confirmDelete === tag.id}
								<form
									method="post"
									action="?/delete"
									use:enhance={() =>
										async ({ update }) => {
											confirmDelete = null;
											await update();
										}}
									class="flex items-center gap-1"
								>
									<input type="hidden" name="id" value={tag.id} />
									<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm">
										{t('ui.cancel')}
									</button>
									<button class="btn btn-danger btn-sm" use:armed>
										{t('notebooks.tags.yesDelete')}
									</button>
								</form>
							{:else}
								<button
									title={t('ui.delete')}
									aria-label={t('ui.delete')}
									onclick={() => (confirmDelete = tag.id)}
									class="icon-btn icon-btn-danger"
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>

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
			<!-- What the server reads for the colour: the box below writes into
			     it, and "no colour" empties it. A colour input has no empty. -->
			<input type="hidden" name="color" value={color ?? ''} />
			<FormGrid>
				<Field label={t('ui.name')} span={12}>
					<OneLine name="label" bind:value={name} class="input" required autofocus />
				</Field>
				<Field label={t('ui.colour')} span={12} hint={t('notebooks.tags.aTagWithNoColour')}>
					<div class="flex items-center gap-2">
						<input
							type="color"
							value={color ?? TAG_COLOR_DEFAULT}
							aria-label={t('ui.colour')}
							oninput={(e) => (color = e.currentTarget.value)}
							class="input h-9 w-14 p-1"
						/>
						<TagChip name={name || editing.name} {color} />
						<button
							type="button"
							onclick={() => (color = null)}
							disabled={color === null}
							class="btn btn-sm ml-auto"
						>
							{t('notebooks.tags.noColour')}
						</button>
					</div>
				</Field>
			</FormGrid>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={closeEdit}>{t('ui.cancel')}</button>
		<button type="submit" form="tag-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
