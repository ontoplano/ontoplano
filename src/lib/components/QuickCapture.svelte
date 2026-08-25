<script lang="ts">
	import { enhance } from '$app/forms';
	import { autofocus } from '$lib/actions/autofocus';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Capture, on a phone.
	 *
	 * Someone who opens the app to write down an idea before it evaporates
	 * should not have to find the Ideas section, wait for it to load and press
	 * New. Four buttons at the top of the dashboard, one tap each, and the thing
	 * is written where it belongs.
	 *
	 * On a phone it is a row of tiles at the top of the dashboard; on a desktop
	 * the same four sit inline in the header, where they cost one line and save
	 * a page load. Both post to the same actions the pages do, so there is no
	 * second write path to keep correct.
	 */
	let {
		error = null,
		/** The desktop shape: a row of small buttons rather than tiles. */
		inline = false
	}: { error?: string | null; inline?: boolean } = $props();

	type Capture = {
		key: string;
		/** The keystroke that opens it, shown in the label. */
		shortcut: string;
		label: string;
		icon: IconName;
		action: string;
		field: string;
		placeholder: string;
		multiline: boolean;
	};

	const CAPTURES: Capture[] = [
		{
			key: 'idea',
			shortcut: 'i',
			label: 'Idea',
			icon: 'ideas',
			action: '/ideas?/create',
			field: 'content',
			placeholder: 'the thing you would otherwise forget',
			multiline: true
		},
		{
			key: 'todo',
			shortcut: 't',
			label: 'Todo',
			icon: 'check',
			action: '/planner/todo?/create',
			field: 'title',
			placeholder: 'something to do, no date yet',
			multiline: false
		},
		{
			key: 'note',
			shortcut: 'd',
			label: 'Note',
			icon: 'diary',
			action: '/diary?/create',
			field: 'content',
			placeholder: "what happened, or what you're thinking",
			multiline: true
		},
		{
			key: 'buy',
			shortcut: 'b',
			label: 'Buy',
			icon: 'shopping',
			action: '/shopping?/create',
			field: 'name',
			placeholder: 'something to pick up',
			multiline: false
		}
	];

	let open = $state<Capture | null>(null);

	/** Opened by key from the page that hosts this. */
	export function openByShortcut(key: string): boolean {
		const match = CAPTURES.find((c) => c.shortcut === key);
		if (!match) return false;
		open = match;
		return true;
	}
</script>

{#if inline}
	<div class="hidden items-center gap-2 lg:flex">
		{#each CAPTURES as capture (capture.key)}
			<button type="button" onclick={() => (open = capture)} class="btn btn-sm">
				<Icon name={capture.icon} />
				{capture.label}
				<!-- `kbd-hint` so a touch screen wide enough for this row still drops
				     it: a keystroke is noise where there is no keyboard. -->
				<span class="kbd-hint text-gray-400">({capture.shortcut})</span>
			</button>
		{/each}
	</div>
{:else}
	<div class="flex gap-2 lg:hidden">
		{#each CAPTURES as capture (capture.key)}
			<button
				type="button"
				onclick={() => (open = capture)}
				class="lift flex flex-1 flex-col items-center gap-1 border border-gray-200 bg-white px-2 py-3 text-xs text-gray-700 shadow-card"
			>
				<Icon name={capture.icon} size={18} />
				<!-- No keystroke here: this is the phone, where there is no keyboard
				     to press it on. The desktop row above says it instead. -->
				<span>{capture.label}</span>
			</button>
		{/each}
	</div>
{/if}

<Modal
	open={open !== null}
	onclose={() => (open = null)}
	title={open ? `New ${open.label.toLowerCase()}` : ''}
	size="sm"
	{error}
>
	{#if open}
		<form
			id="capture-form"
			method="post"
			action={open.action}
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: true });
					if (result.type === 'success') open = null;
				}}
		>
			<!-- Shopping needs to know which list; everything else has one shape. -->
			{#if open.key === 'buy'}
				<input type="hidden" name="type" value="replenish" />
			{/if}

			{#if open.multiline}
				<textarea
					name={open.field}
					required
					rows="4"
					use:autofocus
					placeholder={open.placeholder}
					class="textarea"
				></textarea>
			{:else}
				<input
					name={open.field}
					required
					autocomplete="off"
					use:autofocus
					placeholder={open.placeholder}
					class="input"
				/>
			{/if}
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (open = null)}>Cancel</button>
		<button type="submit" form="capture-form" class="btn btn-primary">
			<Icon name="plus" /> Save
		</button>
	{/snippet}
</Modal>
