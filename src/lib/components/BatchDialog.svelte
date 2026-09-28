<script lang="ts" generics="Verb extends string">
	import type { Snippet } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Modal from '$lib/components/Modal.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { say } from '$lib/said.svelte';
	import type { Selection } from '$lib/selection.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * The dialog a verb in `SelectionBar` opens: the fields that verb needs,
	 * the chosen ids, and one press that does it to all of them or to none.
	 *
	 * A destructive verb gets the armed red button; the rest get Save.
	 */
	let {
		selection,
		ids,
		action,
		title,
		destructive = false,
		done,
		id = 'batch-form',
		fields
	}: {
		selection: Selection<Verb>;
		/** The chosen ids that are on screen — what the press acts on. */
		ids: number[];
		action: string;
		title: string;
		destructive?: boolean;
		/** What to say once it worked, given how many it touched. */
		done: (count: number) => string;
		id?: string;
		/** The verb's own fields, drawn inside the form's grid. */
		fields: Snippet<[Verb]>;
	} = $props();

	const t = useT();

	const submit: SubmitFunction = () => {
		selection.error = undefined;
		return async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				selection.end();
				say(done(Number(result.data?.count ?? 0)));
			} else if (result.type === 'failure') {
				selection.error = String(result.data?.message ?? '');
			}
		};
	};
</script>

<Modal
	open={selection.verb !== null}
	{title}
	description={t('selection.count', { count: ids.length })}
	error={selection.error}
	onclose={() => selection.close()}
	size="sm"
>
	{#if selection.verb}
		<form {id} method="post" {action} use:enhance={submit}>
			<input type="hidden" name="do" value={selection.verb} />
			{#each ids as one (one)}<input type="hidden" name="id" value={one} />{/each}
			<FormGrid>
				{@render fields(selection.verb)}
			</FormGrid>
		</form>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => selection.close()}>{t('ui.cancel')}</button>
		{#if destructive}
			<button type="submit" form={id} class="btn btn-danger" use:armed disabled={!ids.length}
				>{t('ui.delete')}</button
			>
		{:else}
			<button type="submit" form={id} class="btn btn-primary" disabled={!ids.length}
				>{t('ui.save')}</button
			>
		{/if}
	{/snippet}
</Modal>
