<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';

	/**
	 * What a shopping item is made of. See IdeaFields for why this is a
	 * component.
	 */
	let {
		label = $bindable(''),
		notes = $bindable(''),
		price = $bindable(''),
		type = $bindable('replenish'),
		shoppingCategoryId = $bindable<number | null | undefined>(undefined),
		categories = [],
		locations = [],
		locationId = $bindable(null),
		/**
		 * The thing's own fields, as pairs.
		 *
		 * Not every thing shares a shape — a tape is 3m or 5m, a cable is USB-C
		 * or not — so the shape is the thing's rather than a column. Only where
		 * something is being described rather than added to a list.
		 */
		fields = $bindable<[string, string][]>([]),
		showFields = false,
		/** Only when writing something down: see `createItem` for why. */
		askLocation = false,
		compact = false
	}: {
		label?: string;
		notes?: string;
		price?: string;
		type?: string;
		shoppingCategoryId?: number | null | undefined;
		categories?: { id: number; name: string }[];
		locations?: { id: number; name: string; path: string }[];
		locationId?: number | null;
		fields?: [string, string][];
		showFields?: boolean;
		askLocation?: boolean;
		compact?: boolean;
	} = $props();

	const filled = $derived((notes ? 1 : 0) + (price ? 1 : 0) + (type !== 'replenish' ? 1 : 0));
</script>

<Field label="Item" span={compact ? 12 : 8} required>
	<!-- Same reason as the todo's title: see `OneLine.svelte`. -->
	<OneLine name="label" required bind:value={label} />
</Field>

{#snippet rest()}
	<Field label="List" span={compact ? 12 : 4}>
		<select name="type" required bind:value={type} class="select">
			<option value="replenish">Restock</option>
			<option value="someday">Wishlist</option>
		</select>
	</Field>

	{#if type === 'replenish'}
		<Field label="Category" span={12}>
			<select name="shoppingCategoryId" bind:value={shoppingCategoryId} class="select">
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</Field>
	{/if}

	{#if askLocation && locations.length > 0}
		<!-- Where it lives, asked once, while it is being written down. Changing
		     it afterwards is a drag onto the panel, or the row's own control. -->
		<Field label="Location" span={12}>
			<select name="locationId" bind:value={locationId} class="select">
				<option value={null}>— nowhere in particular —</option>
				{#each locations as one (one.id)}
					<option value={one.id}>{one.path}</option>
				{/each}
			</select>
		</Field>
	{/if}

	{#if showFields}
		<Field label="Its own fields" span={12}>
			<div class="space-y-2">
				{#each fields as pair, i (i)}
					<div class="flex items-center gap-2">
						<OneLine
							name="fieldName"
							bind:value={pair[0]}
							placeholder="length"
							class="input min-w-0 flex-1"
						/>
						<OneLine
							name="fieldValue"
							bind:value={pair[1]}
							placeholder="5m"
							class="input min-w-0 flex-1"
						/>
						<!--
							A button, not an instruction.

							"Clearing a name removes that field" is true and is a sentence
							somebody has to read, remember, and then do by hand. The server
							still reads it the same way — a pair with no name is not a
							field — so this empties the row rather than inventing a second
							way to say the same thing.
						-->
						<button
							type="button"
							onclick={() => (fields = fields.filter((_, at) => at !== i))}
							class="icon-btn icon-btn-danger shrink-0 {pair[0] || pair[1] ? '' : 'invisible'}"
							title="Remove this field"
							aria-label="Remove the field {pair[0] || 'being written'}"
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
				+ Another
			</button>
		</Field>
	{/if}

	<Field label="Notes" span={8}>
		<OneLine name="notes" bind:value={notes} class="input" />
	</Field>

	<!-- What it costs, roughly. Prices move and shops disagree, which is why
	     the total says "about" and never claims a receipt. -->
	<Field label="Price" span={4} hint="What it usually costs.">
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
		label={askLocation ? 'List, category, location, notes, price' : 'List, category, notes, price'}
		count={filled}>{@render rest()}</MoreOptions
	>
{:else}
	{@render rest()}
{/if}
