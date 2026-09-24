<script lang="ts">
	/**
	 * What a recipe is made of.
	 *
	 * One definition, two places: the Health room's New dialog and a notebook's
	 * Recipes tab — the same reason `BillFields` and `LedgerFields` exist.
	 * Everything the editor has, so writing one down is one act rather than
	 * creating a title and immediately pressing Edit to write the thing.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { autogrow } from '$lib/actions/autogrow';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Editing = {
		title: string;
		servings: number | null;
		minutes: number | null;
		source: string | null;
		method: string | null;
		notes: string | null;
		notebookId?: number | null;
	} | null;

	let {
		editing = null,
		notebooks = [],
		/** The notebook a recipe written from inside one belongs to. */
		startingNotebook = null
	}: {
		editing?: Editing;
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
	} = $props();
</script>

<FormGrid>
	<Field label={t('health.recipes.whatItIs')} span={12} required>
		<OneLine name="heading" value={editing?.title ?? ''} class="input" required />
	</Field>

	<Field label={t('health.recipes.serves')} span={4}>
		<NumberBox autocomplete="off" name="servings" min="1" value={editing?.servings ?? ''} />
	</Field>

	<Field label={t('health.recipes.minutes')} span={4}>
		<NumberBox autocomplete="off" name="minutes" min="1" value={editing?.minutes ?? ''} />
	</Field>

	<Field label={t('health.recipes.whereItCameFrom')} span={4}>
		<OneLine name="source" value={editing?.source ?? ''} class="input" />
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={12} />

	<Field
		label={t('health.recipes.method')}
		span={12}
		hint={t('health.recipes.markdownHeadingsListsNumbersIngredients')}
	>
		<textarea name="method" rows="8" use:autogrow class="textarea">{editing?.method ?? ''}</textarea
		>
	</Field>

	<Field label={t('ui.notes')} span={12}>
		<textarea name="notes" rows="2" class="textarea">{editing?.notes ?? ''}</textarea>
	</Field>
</FormGrid>
