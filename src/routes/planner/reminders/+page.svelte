<script lang="ts">
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import { keepInView } from '$lib/actions/keep-in-view';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { reminderHref, type ReminderSubject } from '$lib/reminders';
	import { getAction, keyFor } from '$lib/shortcuts';
	import type { ActionData, PageServerData } from './$types';

	/**
	 * Every reminder this account has, which used to be visible nowhere.
	 *
	 * A reminder attached to a block shows on the block and one attached to a
	 * todo shows on the todo, so those two were findable. One attached to
	 * nothing — which the API accepts and the seed makes — arrived as a card in
	 * the corner and then existed in no list at all. This is that list, and it is
	 * where the card now leads.
	 */
	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Reminder = PageServerData['reminders'][number];

	let showForm = $state(false);
	let selectedIndex = $state(0);
	let confirmingDelete: number | null = $state(null);

	/** Not yet gone off, or gone off and not yet put away. */
	const open = $derived(data.reminders.filter((r) => r.dismissedAt === null));
	const past = $derived(data.reminders.filter((r) => r.dismissedAt !== null));

	function isDue(reminder: Reminder): boolean {
		return reminder.remindAt <= data.now;
	}

	const SUBJECT_LABELS: Record<ReminderSubject, string> = {
		instance: 'on a block',
		todo: 'on a todo',
		free: 'on its own'
	};

	/** "Tue 2 Sep, 17:30" — the day matters as much as the time here. */
	function when(remindAt: string): string {
		return new Date(`${remindAt.slice(0, 19)}`).toLocaleString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/**
	 * An hour from now, rounded down to the minute.
	 *
	 * A datetime field opening empty is a field you have to fill in twice — once
	 * for the date you almost certainly meant and once for the time.
	 */
	function defaultWhen(): string {
		const at = new Date(Date.now() + 3_600_000);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			confirmingDelete = null;
			return;
		}

		// While a row is asking whether to delete it, the keyboard belongs to that
		// question.
		if (confirmingDelete !== null) return;

		const action = getAction('/planner/reminders', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'new':
				showForm = true;
				break;
			case 'navigate-down':
				selectedIndex = Math.min(selectedIndex + 1, Math.max(open.length - 1, 0));
				break;
			case 'navigate-up':
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'delete':
				if (open[selectedIndex]) confirmingDelete = open[selectedIndex].id;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="shrink-0 text-base font-semibold text-gray-900">Reminders</h2>
		<button onclick={() => (showForm = !showForm)} class="btn btn-primary btn-sm">
			<Icon name="plus" /> New reminder
			<kbd>{keyFor('/planner/reminders', 'new')}</kbd>
		</button>
	</div>

	<FormError message={form?.message} />

	{#if showForm}
		<Card title="A new reminder" accent="var(--section-accent)">
			<form
				method="post"
				action="?/create"
				use:enhance={() =>
					async ({ update, result }) => {
						await update();
						if (result.type === 'success') showForm = false;
					}}
			>
				<FormGrid>
					<Field label="Say what" span={8} required>
						<input
							name="message"
							required
							maxlength={data.maxMessageLength}
							autocomplete="off"
							placeholder="take the bread out of the oven"
							class="input"
							use:autofocus
						/>
					</Field>
					<Field label="When" span={4} required>
						<input
							name="at"
							type="datetime-local"
							required
							value={defaultWhen()}
							class="input tabular"
						/>
					</Field>
				</FormGrid>
				<div class="mt-4 flex items-center gap-2">
					<button class="btn btn-primary">Set it</button>
					<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
				</div>
			</form>
		</Card>
	{/if}

	<Card title="Waiting" accent="var(--section-accent)" flush>
		{#snippet actions()}
			<span class="tabular text-xs text-gray-500">{open.length}</span>
		{/snippet}

		{#if open.length === 0}
			<div class="p-4">
				<EmptyState
					icon="clock"
					title="Nothing to be told about"
					description="A reminder is the one thing here that reaches out to you. Set one on a block, on a todo, or on nothing at all."
				/>
			</div>
		{:else}
			<div class="divide-y divide-gray-200">
				{#each open as reminder, i (reminder.id)}
					<div
						use:keepInView={selectedIndex === i}
						class="flex items-center gap-4 px-4 py-3 {selectedIndex === i
							? 'ring-2 ring-gray-900 ring-inset'
							: ''}"
					>
						<span class="shrink-0 {isDue(reminder) ? 'text-gray-900' : 'text-gray-500'}">
							<Icon name="clock" size={16} />
						</span>

						<div class="min-w-0 flex-1">
							<!-- The whole row leads where the reminder is about, which is what
							     the card in the corner does too. -->
							<!-- The rule looks at the href expression and cannot see through
							     the helper, which resolves inside itself. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={reminderHref(reminder.subjectKind, reminder.remindAt)}
								class="block truncate text-sm text-gray-900 hover:underline"
							>
								{reminder.message}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
							<span class="mt-0.5 block text-xs text-gray-500">
								<span class="tabular">{when(reminder.remindAt)}</span>
								· {SUBJECT_LABELS[reminder.subjectKind]}
								{#if isDue(reminder)}· due{/if}
							</span>
						</div>

						{#if confirmingDelete === reminder.id}
							<form
								method="post"
								action="?/delete"
								use:enhance={() =>
									async ({ update }) => {
										confirmingDelete = null;
										await update();
									}}
								class="flex shrink-0 items-center gap-1"
							>
								<input type="hidden" name="id" value={reminder.id} />
								<button type="button" class="btn btn-sm" onclick={() => (confirmingDelete = null)}>
									Cancel
								</button>
								<button class="btn btn-danger btn-sm" use:armed use:autofocus>Delete</button>
							</form>
						{:else}
							<div class="flex shrink-0 items-center gap-1">
								{#if isDue(reminder)}
									<form method="post" action="?/dismiss" use:enhance>
										<input type="hidden" name="id" value={reminder.id} />
										<button
											class="icon-btn"
											title="Put it away"
											aria-label="Put away {reminder.message}"
										>
											<Icon name="check" size={16} />
										</button>
									</form>
								{/if}
								<button
									onclick={() => (confirmingDelete = reminder.id)}
									class="icon-btn"
									title="Delete"
									aria-label="Delete {reminder.message}"
								>
									<Icon name="trash" size={16} />
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	{#if past.length > 0}
		<Card title="Put away" description="What has already been said and read." flush>
			<div class="divide-y divide-gray-200">
				{#each past as reminder (reminder.id)}
					<div class="flex items-center gap-4 px-4 py-3">
						<span class="shrink-0 text-gray-500"><Icon name="check" size={16} /></span>
						<div class="min-w-0 flex-1">
							<span class="block truncate text-sm text-gray-500">{reminder.message}</span>
							<span class="tabular mt-0.5 block text-xs text-gray-500"
								>{when(reminder.remindAt)}</span
							>
						</div>
						<form method="post" action="?/delete" use:enhance class="shrink-0">
							<input type="hidden" name="id" value={reminder.id} />
							<button
								class="icon-btn"
								use:armed
								title="Delete"
								aria-label="Delete {reminder.message}"
							>
								<Icon name="trash" size={16} />
							</button>
						</form>
					</div>
				{/each}
			</div>
		</Card>
	{/if}

	<p class="kbd-hint text-xs text-gray-500">
		<kbd>{keyFor('/planner/reminders', 'navigate-down')}</kbd>
		<kbd>{keyFor('/planner/reminders', 'navigate-up')}</kbd> move ·
		<kbd>{keyFor('/planner/reminders', 'new')}</kbd> new ·
		<kbd>{keyFor('/planner/reminders', 'delete')}</kbd> delete
	</p>
</div>
