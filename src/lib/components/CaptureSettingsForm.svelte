<script lang="ts">
	import { untrack } from 'svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import ToggleRow from '$lib/components/ToggleRow.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import { CAPTURE_OPTIONS_URL, captureLook, visibleCaptures, CAPTURES } from '$lib/capture';
	import { orderKinds, type CaptureSettings } from '$lib/capture-settings';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * The capture wheel's settings: the notebook its forms start in, and
	 * which wedges it holds in what order.
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
		notebooks?: { id: number; title: string; folder?: string | null; favourite?: boolean }[];
		id?: string;
		saved?: () => void;
	} = $props();

	type Notebook = { id: number; title: string; folder?: string | null; favourite?: boolean };

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
	let notebookId = $state(untrack(() => settings.notebookId));

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
	<FormGrid>
		<!-- Held at its height while the list arrives, so the wedges below do
		     not jump when it does. -->
		<div class="capture-notebook col-span-12">
			{#if offered === null}
				<!-- Nothing yet: the list is on its way. -->
			{:else if offered.length > 0}
				<FormGrid>
					<NotebookField
						notebooks={offered}
						bind:value={notebookId}
						span={12}
						label={t('captureSettings.mainNotebook')}
					/>
				</FormGrid>
				<p class="mt-1 text-xs text-gray-500">{t('captureSettings.mainNotebookHint')}</p>
			{:else}
				<input type="hidden" name="notebookId" value="" />
				<p class="text-sm text-gray-500">{t('captureSettings.noNotebooksYet')}</p>
			{/if}
		</div>

		<Field label={t('captureSettings.wedges')} group hint={t('captureSettings.wedgesHint')}>
			<div class="space-y-2">
				{#each order as kind, i (kind)}
					{@const look = captureLook(kind)}
					{@const away = unavailable.includes(kind)}
					{@const on = !off.includes(kind) && !away}
					{#if look}
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
					{/if}
				{/each}
			</div>
		</Field>
	</FormGrid>

	{#if !id}
		<button class="btn btn-primary">{t('captureSettings.save')}</button>
	{/if}
</form>

<style>
	/* The notebook picker's own height, label and hint included, kept while the
	   list is still on its way. */
	.capture-notebook {
		min-height: 5.25rem;
	}
</style>
