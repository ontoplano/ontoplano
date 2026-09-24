<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import { namedAttributes } from '$lib/actions/named-attributes';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * What a shopping item is made of. See IdeaFields for why this is a
	 * component.
	 */
	let {
		label = $bindable(''),
		notes = $bindable(''),
		price = $bindable(''),
		type = $bindable('replenish'),
		inventoryCategoryId = $bindable<number | null | undefined>(undefined),
		categories = [],
		locations = [],
		locationId = $bindable(null),
		/**
		 * The thing's attributes, as pairs.
		 *
		 * Not every thing shares a shape — a tape is 3m or 5m, a cable is USB-C
		 * or not — so the shape is the thing's rather than a column. Only where
		 * something is being described rather than added to a list. A name with
		 * no value is a whole attribute: "cable" says as much as "kind: cable".
		 */
		idealQty = $bindable('1'),
		fields = $bindable<[string, string][]>([]),
		showFields = false,
		/** Only when writing something down: see `createItem` for why. */
		askLocation = false,
		compact = false,
		notebooks = [],
		/** The notebook a thing written down inside one belongs to. */
		startingNotebook = null,
		notebookId = $bindable<number | null>(null)
	}: {
		label?: string;
		notes?: string;
		price?: string;
		type?: string;
		inventoryCategoryId?: number | null | undefined;
		categories?: { id: number; name: string }[];
		locations?: { id: number; name: string; path: string }[];
		locationId?: number | null;
		idealQty?: string;
		fields?: [string, string][];
		showFields?: boolean;
		askLocation?: boolean;
		compact?: boolean;
		notebooks?: { id: number; title: string }[];
		startingNotebook?: number | null;
		notebookId?: number | null;
	} = $props();

	const filled = $derived((notes ? 1 : 0) + (price ? 1 : 0) + (type !== 'replenish' ? 1 : 0));
</script>

<Field label={t('fields.buy.item')} span={compact ? 12 : 8} required>
	<!-- Same reason as the todo's title: see `OneLine.svelte`. -->
	<OneLine name="label" required bind:value={label} />
</Field>

{#snippet rest()}
	<Field label={t('fields.buy.list')} span={compact ? 12 : 4}>
		<select name="type" required bind:value={type} class="select">
			<option value="replenish">{t('fields.buy.restock')}</option>
			<option value="someday">{t('fields.buy.wishlist')}</option>
		</select>
	</Field>

	{#if type === 'replenish'}
		<!-- How many you keep, which is what the list is about: still to buy is
		     what this is bigger than the count on the row. One, for almost
		     everything, which is why it is filled in already. -->
		<Field
			label={t('fields.buy.howManyYouKeep')}
			span={6}
			hint={t('fields.buy.theCountTheListCompares')}
		>
			<NumberBox name="idealQty" min="0" step="1" inputmode="numeric" bind:value={idealQty} />
		</Field>

		<Field label={t('ui.category')} span={6}>
			<select name="inventoryCategoryId" bind:value={inventoryCategoryId} class="select">
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</Field>
	{/if}

	{#if askLocation && locations.length > 0}
		<!-- Where it lives, asked once, while it is being written down. Changing
		     it afterwards is a drag onto the panel, or the row's own control. -->
		<Field label={t('fields.buy.location')} span={12}>
			<select name="locationId" bind:value={locationId} class="select">
				<option value={null}>{t('fields.buy.nowhereInParticular')}</option>
				{#each locations as one (one.id)}
					<option value={one.id}>{one.path}</option>
				{/each}
			</select>
		</Field>
	{/if}

	{#if showFields}
		<Field label={t('fields.buy.attributes')} span={12}>
			<div class="space-y-2" use:namedAttributes={() => t('fields.buy.anAttributeNeedsAName')}>
				{#each fields as pair, i (i)}
					<div class="flex items-center gap-2">
						<OneLine
							name="fieldName"
							bind:value={pair[0]}
							placeholder={t('fields.buy.attributeName')}
							class="input min-w-0 flex-1"
						/>
						<!-- A value may be left out — the name alone is the attribute — and
						     the placeholder is where that is said, because the only other
						     way to find out is to try it. -->
						<OneLine
							name="fieldValue"
							bind:value={pair[1]}
							placeholder={t('fields.buy.attributeValue')}
							class="input min-w-0 flex-1"
						/>
						<!--
							A button, not an instruction.

							"Clearing a name removes that attribute" is true and is a
							sentence somebody has to read, remember, and then do by hand.
							The server still reads it the same way — a pair with no name is
							not an attribute — so this empties the row rather than inventing
							a second way to say the same thing.
						-->
						<button
							type="button"
							onclick={() => (fields = fields.filter((_, at) => at !== i))}
							class="icon-btn icon-btn-danger shrink-0 {pair[0] || pair[1] ? '' : 'invisible'}"
							title={t('fields.buy.removeThisAttribute')}
							aria-label={t('fields.buy.removeTheAttribute', {
								written: pair[0] || t('fields.buy.beingWritten')
							})}
						>
							<Icon name="close" />
						</button>
					</div>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => (fields = [...fields, ['', '']])}
				class="btn btn-sm mt-2"
			>
				{t('fields.buy.another')}
			</button>
		</Field>
	{/if}

	<NotebookField {notebooks} value={notebookId ?? startingNotebook} span={12} />

	<Field label={t('ui.notes')} span={8}>
		<OneLine name="notes" bind:value={notes} class="input" />
	</Field>

	<!-- What it costs, roughly. Prices move and shops disagree, which is why
	     the total says "about" and never claims a receipt. -->
	<Field label={t('fields.buy.price')} span={4} hint={t('fields.buy.whatItUsuallyCosts')}>
		<input
			name="price"
			type="text"
			inputmode="decimal"
			autocomplete="off"
			bind:value={price}
			placeholder="1.60"
			class="input tabular"
		/>
	</Field>
{/snippet}

{#if compact}
	<MoreOptions
		label={askLocation
			? t('fields.buy.listCategoryLocationNotesPrice')
			: t('fields.buy.listCategoryNotesPrice')}
		count={filled}>{@render rest()}</MoreOptions
	>
{:else}
	{@render rest()}
{/if}
