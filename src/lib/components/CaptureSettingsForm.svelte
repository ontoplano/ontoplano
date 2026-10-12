<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { untrack } from 'svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import ToggleRow from '$lib/components/ToggleRow.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import { CAPTURE_OPTIONS_URL, captureLook, visibleCaptures, CAPTURES } from '$lib/capture';
	import {
		everyInto,
		FILED_KINDS,
		kindNotebookField,
		sharedNotebook,
		orderKinds,
		type CaptureSettings
	} from '$lib/capture-settings';
	import { useT } from '$lib/i18n';
	import { notebooksHolding } from '$lib/notebook-modules';

	const t = useT();

	/**
	 * The capture wheel's settings: which wedges it holds, in what order, and
	 * the notebook each one writes into — with one picker over them all.
	 *
	 * One form, drawn in two places — Preferences, and the dialog behind the
	 * gear that sits beside the open wheel — both posting to the same action.
	 */
	let {
		settings,
		/** The account's hidden sections: a hidden room takes its wedge with it. */
		hidden = [],
		/** The notebooks to offer, when the page already has them; fetched otherwise. */
		notebooks = undefined,
		/** Set to put the form's button in a dialog's footer instead of under it. */
		id = undefined,
		saved = undefined
	}: {
		settings: CaptureSettings;
		hidden?: readonly string[];
		notebooks?: {
			id: number;
			title: string;
			folder?: string | null;
			favourite?: boolean;
			modules: readonly string[];
		}[];
		id?: string;
		saved?: () => void;
	} = $props();

	type Notebook = {
		id: number;
		title: string;
		folder?: string | null;
		favourite?: boolean;
		modules: readonly string[];
	};

	let fetched = $state<Notebook[] | null>(null);
	const offered = $derived(notebooks ?? fetched);

	$effect(() => {
		if (notebooks !== undefined || fetched !== null) return;
		fetch(CAPTURE_OPTIONS_URL)
			.then((res) => (res.ok ? res.json() : null))
			.then((got: { notebooks?: Notebook[] } | null) => (fetched = got?.notebooks ?? []))
			.catch(() => (fetched = []));
	});

	/*
	 * The list as it is being arranged, seeded from what is stored. Kept
	 * rather than derived: the arrows and ticks are the draft, and the stored
	 * answer only comes back through the save.
	 */
	let order = $state(untrack(() => orderKinds(settings.order)));
	let off = $state(untrack(() => [...settings.off]));
	/**
	 * Each filed kind's notebook, null for none: its own where it has one,
	 * the shared one where it does not — which is what it would start in.
	 */
	let kindNotebooks = $state<Record<string, number | null>>(
		untrack(() =>
			Object.fromEntries(
				FILED_KINDS.map((kind) => [kind, settings.notebooks[kind] ?? settings.notebookId])
			)
		)
	);

	/** Each filed kind with what a notebook must hold to take it. */
	const holds = $derived(
		Object.fromEntries(CAPTURES.filter((c) => c.holds).map((c) => [c.key, c.holds!]))
	);

	/** Whether a notebook has the tab a kind writes into. */
	const canHold = (kind: string, notebookId: number) => {
		const notebook = offered?.find((one) => one.id === notebookId);
		return notebook !== undefined && notebooksHolding([notebook], holds[kind]).length > 0;
	};

	/*
	 * The row above the list: the notebook every wedge writes into, or "Mixed"
	 * while they disagree. It only drives the rows — it posts under a name the
	 * server does not read, and the shared notebook goes as none: a wedge left
	 * on none must stay none, not fall back to a notebook without its tab.
	 */
	const shared = $derived(sharedNotebook(kindNotebooks, canHold));
	/** Kinds whose room is hidden: shown, not offered. */
	const unavailable = $derived(
		CAPTURES.filter((c) => !visibleCaptures(hidden).includes(c)).map((c) => c.key)
	);
	const onCount = $derived(
		order.filter((kind) => !off.includes(kind) && !unavailable.includes(kind)).length
	);

	function toggle(kind: string, on: boolean) {
		off = on ? off.filter((one) => one !== kind) : [...off, kind];
	}

	function shift(kind: string, by: -1 | 1) {
		const at = order.indexOf(kind);
		const to = at + by;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[at], next[to]] = [next[to], next[at]];
		order = next;
	}
</script>

<form
	{id}
	method="post"
	action="/settings/preferences?/saveCapture"
	data-tour="prefs-capture"
	use:settingsForm={{ notice: t('captureSettings.saved'), saved }}
	class="space-y-4"
>
	<Field label={t('captureSettings.wedges')} group hint={t('captureSettings.wedgesHint')}>
		<!--
			One list: each wedge with its switch, its place, and the notebook it
			writes into, in a column of their own so the pickers line up under
			the one that sets them all. A wedge's note ("at least one") is inside
			its row and moves nothing in that column.
		-->
		<div class="space-y-2">
			<!-- The list's head: a band of its own, the picker centred in it and
			     still in the column the rows' pickers stand in. -->
			<div class="wedge-head flex items-center gap-2 border border-gray-200 bg-gray-100">
				<span class="eyebrow min-w-0 flex-1 truncate px-3 text-gray-600"
					>{t('captureSettings.everyWedge')}</span
				>
				<div class="notebook-cell">
					<input type="hidden" name="notebookId" value="" />
					{#if offered && offered.length > 0}
						<NotebookField
							bare
							name="everyNotebook"
							notebooks={offered}
							holds="notes"
							value={shared ?? null}
							mixed={shared === undefined ? t('captureSettings.mixed') : undefined}
							onpicked={(id) => (kindNotebooks = everyInto(id, FILED_KINDS, canHold))}
							label={t('captureSettings.everyWedge')}
						/>
					{/if}
				</div>
			</div>

			{#each order as kind, i (kind)}
				{@const look = captureLook(kind)}
				{@const away = unavailable.includes(kind)}
				{@const on = !off.includes(kind) && !away}
				{#if look}
					<div class="flex items-center gap-2">
						<div class="min-w-0 flex-1">
							<ToggleRow
								label={t(look.label)}
								{on}
								name="on"
								value={kind}
								locked={away}
								always={on && onCount === 1}
								note={on && onCount === 1 ? t('captureSettings.atLeastOne') : undefined}
								onToggle={(now) => toggle(kind, now)}
							>
								{#snippet leading()}
									<input type="hidden" name="kind" value={kind} />
									{#if (on && onCount === 1) || (away && !off.includes(kind))}
										<!-- The row draws no box when it cannot change, and the answer
										     still has to be posted — a wedge away with its room comes
										     back with it. -->
										<input type="hidden" name="on" value={kind} />
									{/if}
									<!-- Arrows first, so the note a row gains when it becomes the
									     last one on moves nothing but its own label. -->
									<span class="flex shrink-0">
										<button
											type="button"
											onclick={() => shift(kind, -1)}
											disabled={i === 0}
											class="icon-btn disabled:opacity-30"
											title={t('settings.preferences.moveUp')}
											aria-label={t('settings.menu.moveUp', { what: t(look.label) })}
										>
											<Icon name="chevron-up" size={16} />
										</button>
										<button
											type="button"
											onclick={() => shift(kind, 1)}
											disabled={i === order.length - 1}
											class="icon-btn disabled:opacity-30"
											title={t('settings.preferences.moveDown')}
											aria-label={t('settings.menu.moveDown', { what: t(look.label) })}
										>
											<Icon name="chevron-down" size={16} />
										</button>
									</span>
									<span class="shrink-0" style="color: {look.color}" aria-hidden="true">
										<Icon name={look.icon} size={18} />
									</span>
								{/snippet}
							</ToggleRow>
						</div>
						<!-- Held at its width whatever is in it, so the list does not
						     shift when the notebooks arrive. -->
						<div class="notebook-cell">
							{#if !FILED_KINDS.includes(kind)}
								<span
									class="block w-full text-center text-gray-500"
									title={t('captureSettings.filedNowhere')}
									aria-label={t('captureSettings.filedNowhere')}>—</span
								>
							{:else if offered && offered.length > 0 && notebooksHolding(offered, holds[kind]).length === 0}
								<span
									class="block w-full text-center text-gray-500"
									title={t('captureSettings.noneHolds')}
									aria-label={t('captureSettings.noneHolds')}>—</span
								>
							{:else if offered && offered.length > 0}
								<NotebookField
									bare
									notebooks={offered}
									holds={holds[kind]}
									bind:value={kindNotebooks[kind]}
									name={kindNotebookField(kind)}
									label={t(look.label)}
								/>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</Field>

	{#if offered && offered.length === 0}
		<EmptyState compact icon="notebook" title={t('captureSettings.noNotebooksYet')} />
	{/if}

	{#if !id}
		<button class="btn btn-primary">{t('captureSettings.save')}</button>
	{/if}
</form>

<style>
	/* The notebook column: one width for every row and the row above them. */
	.notebook-cell {
		display: flex;
		flex: none;
		width: 8.5rem;
	}

	/*
	 * Stands out past the rows by its own padding, so the picker inside it
	 * lines up with theirs and sits in the middle of the band.
	 */
	.wedge-head {
		margin-inline: -0.375rem;
		padding: 0.375rem;
	}

	/* The picker takes the whole cell, so every row's is one width. */
	.notebook-cell > :global([data-picker]) {
		flex: 1 1 0;
		min-width: 0;
	}

	@media (min-width: 640px) {
		.notebook-cell {
			width: 13rem;
		}
	}
</style>
