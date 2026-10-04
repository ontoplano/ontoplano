<script lang="ts">
	/**
	 * What a label is: its name, what it means here, and the colour it wears.
	 *
	 * The three questions the Tags screen asks, and the same three a notebook
	 * asks from inside — one form, so an answer given in either lands the
	 * same way. The form around it is the caller's: the action, the hidden
	 * id, and the hidden `color` the server reads (a colour input has no
	 * empty, so "no colour" is written there as nothing).
	 */
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import TextBox from '$lib/components/TextBox.svelte';
	import { TAG_COLOR_DEFAULT } from '$lib/colors';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		name = $bindable(''),
		description = $bindable(''),
		color = $bindable<string | null>(null),
		/** The name as it was, for the chip while the box is empty. */
		was
	}: {
		name: string;
		description: string;
		color: string | null;
		was: string;
	} = $props();
</script>

<input type="hidden" name="color" value={color ?? ''} />
<FormGrid>
	<Field label={t('ui.name')} span={12}>
		<OneLine name="label" bind:value={name} class="input" required autofocus />
	</Field>
	<!-- What the word means here. `#short` on the shopping is low on
	     something; `#short` on a book is the book. -->
	<Field label={t('tags.whatItMeans')} span={12} hint={t('tags.whatItMeansHint')}>
		<TextBox name="description" bind:value={description} rows={2} />
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
			<TagChip name={name || was} {color} />
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
