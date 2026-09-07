<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import { autogrow } from '$lib/actions/autogrow';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import CookMode from '$lib/components/CookMode.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);
	let confirmingDelete = $state(false);
	/** Which picture is one press away from going. */
	let confirmingPicture = $state<number | null>(null);
	/** The gallery's own form, submitted the moment a file is chosen. */
	let pictureForm = $state<HTMLFormElement>();
	let uploading = $state(false);
	/** Said here rather than by the server, for the ones never sent. */
	let pictureProblem = $state('');
	let cooking = $state(false);
	let scheduling = $state(false);
	let cookMode = $state(false);
	let pasting = $state(false);
	let nameBox: HTMLInputElement | undefined = $state();

	/** Three lines that show the shape without explaining it. */
	const PASTE_EXAMPLE = '300 g rice\n2 onions, finely chopped\n1/2 tsp salt';

	const missing = $derived(data.ingredients.filter((i) => !i.inStock));

	/**
	 * The ingredient box.
	 *
	 * A `datalist` rather than a hand-built combobox: it offers what you already
	 * buy, and anything else typed into it becomes a new shopping item on
	 * submit. One control, no modes, and it works without JavaScript.
	 */
	let ingredientName = $state('');

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
			cooking = false;
			scheduling = false;
			cookMode = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if cookMode}
	<CookMode
		title={data.recipe.title}
		ingredients={data.ingredients}
		methodHtml={data.recipe.method ? renderMarkdown(data.recipe.method) : ''}
		onclose={() => (cookMode = false)}
	/>
{/if}

<div class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<a
				href={resolve('/health/recipes')}
				class="text-xs text-gray-500 hover:text-gray-900 hover:underline">&larr; All recipes</a
			>
			<h1 class="mt-1 text-lg font-bold text-gray-900">{data.recipe.title}</h1>
			<p class="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
				{#if data.recipe.minutes}<span class="tabular">{data.recipe.minutes} min</span>{/if}
				{#if data.recipe.servings}<span class="tabular">serves {data.recipe.servings}</span>{/if}
				{#if data.recipe.lastCookedAt}
					<span>last cooked {data.recipe.lastCookedAt.slice(0, 10)}</span>
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button onclick={() => (cookMode = true)} class="btn btn-sm" title="Cook it now">
				<Icon name="flame" /> Cook
			</button>
			<button onclick={() => (scheduling = true)} class="btn btn-sm">
				<Icon name="calendar" /> Put it on a day
			</button>
			<button onclick={() => (cooking = true)} class="btn btn-primary btn-sm">
				<Icon name="check" /> Cooked it
			</button>
			<button onclick={() => (editing = true)} class="btn btn-sm" title="Edit" aria-label="Edit">
				<Icon name="edit" />
			</button>
			<button
				onclick={() => (confirmingDelete = true)}
				class="btn btn-danger btn-sm"
				title="Delete"
				aria-label="Delete"><Icon name="trash" /></button
			>
		</div>
	</div>

	<FormError message={form?.message} />

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
		<section class="flex flex-col border border-gray-200 bg-white shadow-card">
			<header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
				<h2 class="eyebrow text-gray-600">Ingredients</h2>
				{#if missing.length > 0}
					<span class="text-xs text-amber-700">{missing.length} not in the cupboard</span>
				{/if}
			</header>

			{#if data.ingredients.length > 0}
				<ul class="divide-y divide-gray-200">
					{#each data.ingredients as ingredient (ingredient.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
							<span class="tabular w-20 shrink-0 text-gray-500">
								{[ingredient.quantity, ingredient.unit].filter(Boolean).join(' ')}
							</span>
							<span class="min-w-0 flex-1 text-gray-900">
								{ingredient.name}
								{#if ingredient.note}
									<span class="text-xs text-gray-500">· {ingredient.note}</span>
								{/if}
							</span>
							{#if !ingredient.inStock}
								<span class="chip text-amber-700">to buy</span>
							{/if}
							<!-- Every ingredient is a shopping item; this is the way to it,
							     for when you want to check the price or tick it off. -->
							<a
								href={resolve('/shopping')}
								class="shrink-0 text-gray-500 hover:text-gray-900"
								title="Find {ingredient.name} on the shopping list"
								aria-label="Find {ingredient.name} on the shopping list"
							>
								<Icon name="shopping" size={14} />
							</a>
							<form method="post" action="?/removeIngredient" use:enhance>
								<input type="hidden" name="id" value={ingredient.id} />
								<button
									class="text-xs text-gray-500 hover:text-red-600"
									title="Remove"
									aria-label="Remove">&times;</button
								>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- Typing something new here puts it on the shopping list, which is how
			     the list stays current without anybody maintaining it. -->
			<form
				method="post"
				action="?/addIngredient"
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: result.type === 'success' });
						if (result.type !== 'success') return;

						ingredientName = '';
						// Straight back to the name box: writing a recipe is typing
						// fifteen of these, and reaching for the mouse between each one is
						// the reason the fifteenth never gets typed.
						await tick();
						nameBox?.focus();
					}}
				class="border-t border-gray-200 px-4 py-3"
			>
				<input type="hidden" name="recipeId" value={data.recipe.id} />
				<div class="flex flex-wrap gap-2">
					<input
						autocomplete="off"
						name="quantity"
						type="number"
						step="any"
						min="0"
						placeholder="2"
						class="input w-16"
						aria-label="Amount"
					/>
					<input
						name="unit"
						placeholder="tbsp"
						autocomplete="off"
						class="input w-20"
						aria-label="Unit"
					/>
					<input
						name="label"
						bind:this={nameBox}
						bind:value={ingredientName}
						list="pantry"
						required
						placeholder="olive oil"
						autocomplete="off"
						class="input min-w-0 flex-1"
						aria-label="Ingredient"
					/>
					<datalist id="pantry">
						{#each data.pantry as item (item.id)}
							<option value={item.name}></option>
						{/each}
					</datalist>
					<button class="btn btn-sm"><Icon name="plus" /> Add</button>
				</div>
				<p class="mt-2 text-xs text-gray-500">
					Anything new goes onto the shopping list as something you do not have.
				</p>
			</form>

			<!--
				Or paste the whole list.

				Every recipe on the internet is a list of lines, and typing them back
				one field at a time is the reason a recipe never gets written down.
				Behind a disclosure because it is the second way to do the same
				thing, and one form has one button.
			-->
			<div class="border-t border-gray-200 px-4 py-3">
				{#if !pasting}
					<button onclick={() => (pasting = true)} class="btn btn-sm">
						<Icon name="copy" /> Paste a list
					</button>
				{:else}
					<form
						method="post"
						action="?/importIngredients"
						use:enhance={() =>
							async ({ update, result }) => {
								// It closes on success and is destroyed; resetting only makes the
								// fields blank for a frame first. On a failure it keeps what was typed.
								await update({ reset: false });
								if (result.type === 'success') pasting = false;
							}}
					>
						<input type="hidden" name="recipeId" value={data.recipe.id} />
						<label class="block">
							<span class="eyebrow text-gray-600">Paste the ingredients</span>
							<textarea
								name="list"
								rows="6"
								use:autofocus
								placeholder={PASTE_EXAMPLE}
								class="textarea mt-1"
							></textarea>
						</label>
						<p class="mt-2 text-xs text-gray-500">
							One per line. Bullets, numbers and headings are ignored; anything after a comma
							becomes a note.
						</p>
						<div class="mt-2 flex items-center justify-end gap-2">
							<button type="button" class="btn btn-sm" onclick={() => (pasting = false)}>
								Cancel
							</button>
							<button class="btn btn-primary btn-sm" title="Add them" aria-label="Add them">
								<Icon name="plus" />
							</button>
						</div>
					</form>
				{/if}

				{#if form?.added}
					<p class="mt-2 text-xs text-gray-600">Added {form.added} of them.</p>
				{/if}
			</div>
		</section>

		<section class="border border-gray-200 bg-white shadow-card">
			<header class="border-b border-gray-200 px-4 py-3">
				<h2 class="eyebrow text-gray-600">Method</h2>
			</header>
			<div class="p-4">
				{#if data.recipe.method}
					<div class="md text-sm text-gray-900">
						<!-- `renderMarkdown` escapes everything before it emits a tag. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderMarkdown(data.recipe.method)}
					</div>
				{:else}
					<p class="text-sm text-gray-500">
						Nothing written yet. <button
							onclick={() => (editing = true)}
							class="underline hover:text-gray-600">Write it</button
						>.
					</p>
				{/if}

				{#if data.recipe.source}
					<p class="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-500">
						From {data.recipe.source}
					</p>
				{/if}
			</div>
		</section>

		<!--
			The pictures, and which one is the recipe.
			A gallery rather than illustrations inside the method: these have an
			order, one of them stands for the recipe in every list, and how many
			there may be is the instance's call. The main one is marked with a star
			because that is the same word the rest of the app uses for "this is the
			one" — and it is never only a colour, which nobody can rely on seeing.
		-->
		<section class="border border-gray-200 bg-white shadow-card" data-tour="recipe-pictures">
			<header
				class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"
			>
				<h2 class="eyebrow shrink-0 text-gray-600">Pictures</h2>
				<span class="text-xs text-gray-500">
					{data.pictures.length} of {data.pictureLimits.most}, up to {data.pictureLimits
						.kilobytes}KB each
				</span>
			</header>

			<div class="p-4">
				{#if data.pictures.length > 0}
					<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each data.pictures as picture (picture.id)}
							<li class="group relative">
								<img
									src="/media/{picture.id}"
									alt={picture.alt || picture.filename}
									loading="lazy"
									class="aspect-square w-full rounded-md border border-gray-200 bg-white object-cover"
								/>

								{#if picture.isMain}
									<span
										class="absolute top-1 left-1 flex items-center gap-1 rounded bg-gray-900/80 px-1.5 py-0.5 text-[0.65rem] font-medium text-white"
									>
										<Icon name="star" /> Main
									</span>
								{/if}

								<div class="mt-1 flex items-center justify-between gap-1">
									{#if !picture.isMain}
										<form method="post" action="?/setMainPicture" use:enhance>
											<input type="hidden" name="recipeId" value={data.recipe.id} />
											<input type="hidden" name="mediaId" value={picture.id} />
											<button
												class="btn btn-sm btn-quiet"
												title="Make this the main picture"
												aria-label="Make this the main picture"><Icon name="star" /></button
											>
										</form>
									{:else}
										<span></span>
									{/if}

									<!--
										Two steps, and the second one where the first one was not:
										a bin under the cursor that removes on the second click is
										a picture lost to a double-click. `use:armed` ignores the
										first 450ms of the confirm for the same reason.
									-->
									{#if confirmingPicture === picture.id}
										<span class="flex items-center gap-1">
											<button
												type="button"
												class="btn btn-sm btn-quiet"
												onclick={() => (confirmingPicture = null)}
												title="Keep it"
												aria-label="Keep it"><Icon name="close" /></button
											>
											<form method="post" action="?/removePicture" use:enhance>
												<input type="hidden" name="recipeId" value={data.recipe.id} />
												<input type="hidden" name="mediaId" value={picture.id} />
												<button
													class="btn btn-sm btn-danger"
													use:armed
													title="Remove it"
													aria-label="Remove it">Remove</button
												>
											</form>
										</span>
									{:else}
										<button
											type="button"
											class="btn btn-sm btn-quiet"
											onclick={() => (confirmingPicture = picture.id)}
											title="Remove this picture"
											aria-label="Remove this picture"><Icon name="trash" /></button
										>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500">
						No pictures yet — the first one you add becomes the one the list shows.
					</p>
				{/if}

				{#if data.pictures.length < data.pictureLimits.most}
					<!--
						Choosing the file is the whole gesture.

						There was a second button to press afterwards, which is a step
						nobody wants and half of people miss. The form submits itself on
						change — and refuses an over-large file here, before sending it,
						because a body over the Node adapter's limit never reaches this
						app at all: what comes back is not the JSON the form is waiting
						for, and the page reports an unexplained crash. That is what a
						1.1MB photograph looked like.

						The input is emptied either way, so the same file can be chosen
						again after a refusal.
					-->
					<form
						bind:this={pictureForm}
						method="post"
						action="?/addPicture"
						enctype="multipart/form-data"
						use:enhance={() =>
							async ({ update }) => {
								uploading = false;
								await update();
							}}
						class="mt-3 flex flex-wrap items-center gap-2"
					>
						<input type="hidden" name="recipeId" value={data.recipe.id} />
						<label class="btn btn-sm">
							<Icon name="image" /> Add a picture
							<input
								type="file"
								name="file"
								required
								accept="image/png,image/jpeg,image/webp,image/gif"
								class="sr-only"
								onchange={(e) => {
									const field = e.currentTarget as HTMLInputElement;
									const file = field.files?.[0];
									pictureProblem = '';
									if (!file) return;
									if (file.size > data.pictureLimits.kilobytes * 1024) {
										pictureProblem = `Pictures here are at most ${data.pictureLimits.kilobytes}KB, and ${file.name} is ${Math.ceil(file.size / 1024)}KB.`;
										field.value = '';
										return;
									}
									uploading = true;
									pictureForm?.requestSubmit();
								}}
							/>
						</label>
						{#if uploading}
							<span class="text-xs text-gray-500">uploading…</span>
						{:else}
							<span class="text-xs text-gray-500">
								up to {data.pictureLimits.kilobytes}KB
							</span>
						{/if}
					</form>
					{#if pictureProblem}
						<p class="mt-1 text-xs text-red-700">{pictureProblem}</p>
					{/if}
				{:else}
					<p class="mt-3 text-xs text-gray-500">
						That is as many as this instance allows. Remove one to add another.
					</p>
				{/if}
			</div>
		</section>
	</div>
</div>

<Modal bind:open={editing} error={form?.message} title="Edit recipe">
	<form
		id="edit-form"
		method="post"
		action="?/update"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<input type="hidden" name="id" value={data.recipe.id} />
		<FormGrid>
			<Field label="What it is" span={12} required>
				<input name="heading" required value={data.recipe.title} autocomplete="off" class="input" />
			</Field>
			<Field label="Serves" span={4}>
				<input
					autocomplete="off"
					name="servings"
					type="number"
					min="1"
					value={data.recipe.servings ?? ''}
					class="input"
				/>
			</Field>
			<Field label="Minutes" span={4}>
				<input
					autocomplete="off"
					name="minutes"
					type="number"
					min="1"
					value={data.recipe.minutes ?? ''}
					class="input"
				/>
			</Field>
			<Field label="Where it came from" span={4}>
				<input name="source" value={data.recipe.source} autocomplete="off" class="input" />
			</Field>
			<Field label="Method" span={12} hint="Markdown: headings, lists, numbers.">
				<textarea name="method" rows="10" use:autogrow class="textarea"
					>{data.recipe.method}</textarea
				>
			</Field>
			<Field label="Notes" span={12}>
				<textarea name="notes" rows="2" class="textarea">{data.recipe.notes}</textarea>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
		<button type="submit" form="edit-form" class="btn btn-primary">Save</button>
	{/snippet}
</Modal>

<!--
	Cooking it does not empty the cupboard.

	Marking every ingredient as used up would put salt on the shopping list after
	every meal and teach anybody to ignore the list. So it asks, with nothing
	ticked.
-->
<Modal
	bind:open={cooking}
	title="Cooked it"
	description="Anything you finished off goes back on the shopping list."
	size="sm"
>
	<form
		id="cooked-form"
		method="post"
		action="?/cooked"
		use:enhance={() =>
			async ({ update }) => {
				await update({ reset: false });
				cooking = false;
			}}
	>
		<input type="hidden" name="id" value={data.recipe.id} />
		{#if data.ingredients.length === 0}
			<p class="text-sm text-gray-500">Nothing in it yet.</p>
		{:else}
			<ul class="space-y-1">
				{#each data.ingredients as ingredient (ingredient.id)}
					<li>
						<label class="flex items-center gap-2 text-sm text-gray-900">
							<input type="checkbox" name="ranOut" value={ingredient.itemId} />
							Ran out of {ingredient.name}
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (cooking = false)}>Cancel</button>
		<button type="submit" form="cooked-form" class="btn btn-primary">Done</button>
	{/snippet}
</Modal>

<Modal
	bind:open={confirmingDelete}
	title="Delete this recipe?"
	description="“{data.recipe.title}” will be gone."
	size="sm"
>
	<p class="text-sm text-gray-600">
		Its ingredients stay on the shopping list — they are things you buy, not parts of the recipe.
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = false)}>Cancel</button>
		<form method="post" action="?/delete" use:enhance>
			<input type="hidden" name="id" value={data.recipe.id} />
			<button class="btn btn-danger" use:armed>Delete the recipe</button>
		</form>
	{/snippet}
</Modal>

<!--
	A meal is a block on the planner grid with the recipe attached, not an entry
	in a second calendar. That is why dinner turns up beside deep work, and why
	"what does this week need" is a join.
-->
<Modal
	bind:open={scheduling}
	error={form?.message}
	title="Put it on a day"
	description="It becomes a block on the plan, like anything else you give time to."
	size="sm"
>
	<form
		id="schedule-form"
		method="post"
		action="?/schedule"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') scheduling = false;
			}}
	>
		<input type="hidden" name="recipeId" value={data.recipe.id} />
		<input type="hidden" name="label" value={data.recipe.title} />
		<FormGrid>
			<Field label="Day" span={6} required>
				<input
					autocomplete="off"
					name="date"
					type="date"
					required
					value={data.today}
					class="input"
				/>
			</Field>
			<Field label="At" span={6} required>
				<input
					autocomplete="off"
					name="startTime"
					type="time"
					required
					value="19:00"
					class="input"
				/>
			</Field>
			<Field label="For" span={6} hint="Minutes.">
				<input
					autocomplete="off"
					name="durationMinutes"
					type="number"
					min="5"
					step="5"
					value={data.recipe.minutes ?? 45}
					class="input"
				/>
			</Field>
			<Field label="Counts as" span={6}>
				<select name="categoryId" class="select">
					{#each data.categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (scheduling = false)}>Cancel</button>
		<button type="submit" form="schedule-form" class="btn btn-primary">Put it on the plan</button>
	{/snippet}
</Modal>
