<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookFields from '$lib/components/fields/NotebookFields.svelte';
	import NotebookTags from '$lib/components/NotebookTags.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import NotebookDelete from '$lib/components/NotebookDelete.svelte';
	import NotebookHeader from '$lib/components/NotebookHeader.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);
	/** The labels on what is filed here — see `NotebookTags`. */
	let managingTags = $state(false);

	/** The New button for whichever tab is showing — see NotebookDetail. */
	let newAction = $state<
		{ label: string; labels: string[]; run?: () => void; href?: string } | undefined
	>(undefined);
	/** The Link button beside it — see NotebookDetail. */
	let linkAction = $state<{ label: string; run: () => void } | undefined>(undefined);
	let confirmingDelete = $state(false);

	/*
	 * The tab's New, drawn by the room's bar like every other room's verb —
	 * it follows the tab below: New note, New task, New goal.
	 */
	setRoomAction(() =>
		newAction
			? {
					label: newAction.label,
					run: newAction.run,
					href: newAction.href,
					kbd: keyFor('/notebooks', 'new')
				}
			: null
	);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			editing = false;
			confirmingDelete = false;
		} else if (
			getAction('/notebooks', e.key) === 'new' &&
			newAction?.run &&
			!editing &&
			!e.defaultPrevented
		) {
			// The same key the shelf answers, for whatever the tab below holds.
			e.preventDefault();
			newAction.run();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<!-- The header and the tabs under it are one card: the header is a pane of
	     it, and so is everything below. -->
	<Card flush class="min-w-0">
		<NotebookHeader
			notebook={data.notebook}
			pictureKilobytes={data.pictureKilobytes}
			onFamilyPlan={data.onFamilyPlan}
			back={{ href: resolve('/notebooks'), label: t('notebooks.id.larrAllNotebooks') }}
			link={linkAction}
			onedit={() => (editing = true)}
			ontags={() => (managingTags = true)}
		/>

		<FormError message={form?.message} />

		<!--
		The whole width, which is the point of being here rather than on the index.

		`min-w-0` because it is a flex column: without it every child may be as
		wide as its widest unbreakable thing, and one `/api/v1/…` in a note made
		the whole card wider than the phone. The page clips rather than scrolls,
		so what that looked like was ordinary sentences with their right-hand
		ends missing.
	-->
		<section class="flex min-w-0 flex-col border-t border-gray-200">
			<NotebookDetail
				notebook={data.notebook}
				contents={data.contents}
				allPeople={data.allPeople}
				categories={data.categories}
				inventoryCategories={data.inventoryCategories}
				workoutCategories={data.workoutCategories}
				parsers={data.parsers}
				currency={data.currency}
				pickableNotebooks={data.pickableNotebooks}
				locations={data.locations}
				pictureKilobytes={data.pictureKilobytes}
				areas={data.areas}
				workoutMeasures={data.workoutMeasures}
				slots={data.slots}
				todos={data.todos}
				allTodos={data.allTodos}
				activities={data.activities}
				error={form?.message ?? null}
				bind:newAction
				bind:linkAction
			/>
		</section>
	</Card>
</div>

<NotebookTags
	bind:open={managingTags}
	title={data.notebook.title}
	tags={data.notebookTags}
	action="?/saveTag"
	untagAction={`?/untagNotebook&notebook=${data.notebook.id}`}
	error={form?.message ?? null}
/>

<Modal bind:open={editing} error={form?.message} title={t('notebooks.id.editNotebook')}>
	<form
		id="notebook-form"
		method="post"
		action="?/update"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<input type="hidden" name="id" value={data.notebook.id} />
		<NotebookFields
			title={data.notebook.title}
			folder={data.notebook.folder}
			description={data.notebook.description}
			defaultTags={data.notebook.defaultTags}
			categoryId={data.notebook.categoryId}
			categories={data.categories}
			notebook={data.notebook}
			notebooks={data.pickableNotebooks}
			pictureKilobytes={data.pictureKilobytes}
		/>
	</form>

	{#snippet footer()}
		<button
			type="button"
			class="icon-btn mr-auto"
			title={t('ui.delete')}
			aria-label={t('ui.delete')}
			onclick={() => (confirmingDelete = true)}
		>
			<Icon name="trash" />
		</button>
		<button type="button" class="btn" onclick={() => (editing = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<NotebookDelete
	bind:open={confirmingDelete}
	notebook={data.notebook}
	error={form?.message}
	ondeleted={() => (editing = false)}
/>
