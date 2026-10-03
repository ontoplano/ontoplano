<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { loadAfterHistory } from '$lib/back-closes';
	import Modal from '$lib/components/Modal.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Deleting a notebook, confirmed in a dialog of its own.
	 *
	 * The shelf and the notebook's own page both open it from their Edit
	 * notebook dialogue. The `delete` action redirects to `/notebooks`;
	 * `ondeleted` lets the page close whatever it had open before it goes.
	 *
	 * The redirect is followed from `onclosed`, not from the submission: on a
	 * phone this dialog holds a history entry and gives it back with
	 * `history.back()`, and a navigation fired before that pop lands is undone
	 * by it — the notebook was deleted and the shelf still showed it. The Edit
	 * notebook dialogue under this one gives its entry back too, a moment
	 * later, so the redirect is made once no pop can land on it.
	 */
	let {
		open = $bindable(false),
		notebook,
		error = null,
		ondeleted
	}: {
		open?: boolean;
		notebook: { id: number; title: string };
		error?: string | null;
		ondeleted?: () => void;
	} = $props();

	/** Whether the delete went through, so closing is followed by leaving. */
	let leaving = $state(false);
</script>

<Modal
	bind:open
	{error}
	title={t('notebooks.id.deleteThisNotebook')}
	description={t('notebooks.id.titleWillBeGone', { title: notebook.title })}
	size="sm"
	onclosed={async () => {
		if (!leaving) return;
		leaving = false;
		await loadAfterHistory(() => goto(resolve('/notebooks'), { invalidateAll: true }));
	}}
>
	<p class="text-sm text-gray-600">
		{t('notebooks.id.itsNotesTasksAndGoals')}
		<strong class="font-medium text-gray-900">{t('notebooks.id.notesWithoutANotebook')}</strong>{t(
			'notebooks.id.atTheBottomOf'
		)}
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (open = false)}>{t('ui.cancel')}</button>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				async ({ update, result }) => {
					if (result.type === 'redirect') {
						leaving = true;
						open = false;
						ondeleted?.();
						return;
					}
					await update();
				}}
		>
			<input type="hidden" name="id" value={notebook.id} />
			<button class="btn btn-danger" use:armed>{t('notebooks.id.deleteTheNotebook')}</button>
		</form>
	{/snippet}
</Modal>
