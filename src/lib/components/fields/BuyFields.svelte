<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import AttributeFields from '$lib/components/AttributeFields.svelte';
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
		notebooks?: { id: number; title: string; modules: readonly string[] }[];
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
		<Field label={t('fields.buy.attributes')} span={12} group>
			<!-- The editor a task's attributes use, posting the names the item
			     actions read. -->
			<AttributeFields
				bind:pairs={fields}
				names={{ key: 'fieldName', value: 'fieldValue' }}
				valueOptional
			/>
		</Field>
	{/if}

	<NotebookField {notebooks} holds="inventory" value={notebookId ?? startingNotebook} span={12} />

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
