<script lang="ts">
	/**
	 * What a ledger is made of.
	 *
	 * One definition, three places: the Finance room's New dialog, its Edit
	 * dialog, and a notebook's Ledgers tab — the same reason `BillFields` and
	 * `HabitFields` exist. New and Edit were two copies of the same three
	 * fields a hundred lines apart, which is how the edit form ended up without
	 * the hint the new one carries.
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { LEDGER_KINDS, LEDGER_KIND_LABELS } from '$lib/services/ledgers';
	import { useT } from '$lib/i18n';

	const t = useT();

	type Editing = {
		name: string;
		kind: string;
		defaultParser: string | null;
		notebookId?: number | null;
	} | null;

	let {
		editing = null,
		/** The statement exports this account is usually given, to preselect one. */
		parsers = [],
		notebooks = [],
		/** The notebook a ledger made from inside one belongs to. */
		startingNotebook = null
	}: {
		editing?: Editing;
		parsers?: { key: string; name: string }[];
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
	} = $props();
</script>

<FormGrid>
	<Field label={t('ui.name')} span={12} required>
		<OneLine
			name="heading"
			placeholder={t('finance.ledgers.currentAccount')}
			value={editing?.name ?? ''}
			class="input"
			required
			autofocus
		/>
	</Field>

	<Field label={t('finance.ledgers.whatItIs')} span={6}>
		<select name="kind" class="select" value={editing?.kind ?? LEDGER_KINDS[0]}>
			{#each LEDGER_KINDS as kind (kind)}
				<option value={kind}>{t(LEDGER_KIND_LABELS[kind])}</option>
			{/each}
		</select>
	</Field>

	<NotebookField {notebooks} value={editing?.notebookId ?? startingNotebook} span={6} />

	<Field
		label={t('finance.ledgers.usualExport')}
		span={12}
		hint={t('finance.ledgers.preselectedWhenImportingIntoThis')}
	>
		<select name="defaultParser" class="select" value={editing?.defaultParser ?? ''}>
			<option value="">{t('finance.ledgers.askEveryTime')}</option>
			{#each parsers as parser (parser.key)}<option value={parser.key}>{parser.name}</option>{/each}
		</select>
	</Field>
</FormGrid>
