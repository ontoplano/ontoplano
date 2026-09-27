<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import { keepInView } from '$lib/actions/keep-in-view';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { DEVICE_ORIGIN } from '$lib/instance-choice';
	import { moduleMeta } from '$lib/notebook-modules';
	import {
		DIRECTION_LABELS,
		HANDOFF_AT,
		HANDOFF_KEY,
		HANDOFF_SLOT,
		HANDOFF_WIDGET,
		ORDER_LABELS,
		STATUS_LABELS,
		WIDGET_DIRECTIONS,
		WIDGET_HANDOFF_PATH,
		WIDGET_SECTIONS,
		defaultDirection,
		type WidgetDirection,
		type WidgetSection
	} from '$lib/notebook-widget';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { useT } from '$lib/i18n';

	const t = useT();
	const PAGE = '/settings/integrations/widget';

	type Widget = {
		id: number;
		notebookId: number;
		notebookTitle: string;
		section: WidgetSection;
		status: string;
		order: string;
		direction: WidgetDirection;
		tag: string | null;
		lastUsedAt: string | null;
		connected: boolean;
	};
	type Notebook = { id: number; title: string; sections: WidgetSection[]; tags: string[] };

	let {
		widgets,
		notebooks,
		form
	}: {
		widgets: Widget[];
		notebooks: Notebook[];
		form: {
			message?: string;
			created?: { id: number; token: string; origin: string; slot: string };
			updated?: { id: number; origin: string; slot: string };
		} | null;
	} = $props();

	/*
	 * The phone's widget number, when the phone sent somebody here to set one
	 * up. A widget belongs to one home screen, so a new one is only offered
	 * when there is a home screen waiting for it.
	 */
	const slot = $derived(page.url.searchParams.get(HANDOFF_SLOT) ?? '');
	const reconfiguring = $derived(Number(page.url.searchParams.get(HANDOFF_WIDGET)) || null);

	let open = $state(false);
	let editing = $state<Widget | null>(null);
	let deleting = $state<Widget | null>(null);
	let cursor = $state(-1);

	// The form's choices, which depend on each other: a notebook offers its own
	// tabs, a tab offers its own filters and orders.
	let notebookId = $state(0);
	let section = $state<WidgetSection>('tasks');
	let status = $state('');
	let order = $state('');
	let direction = $state<WidgetDirection>('desc');
	let tag = $state('');

	const chosenNotebook = $derived(notebooks.find((one) => one.id === notebookId));
	const offer = $derived(WIDGET_SECTIONS[section]);

	function pickNotebook(id: number) {
		notebookId = id;
		const sections = notebooks.find((one) => one.id === id)?.sections ?? [];
		if (!sections.includes(section)) pickSection(sections[0] ?? 'notes');
	}

	function pickSection(next: WidgetSection) {
		section = next;
		status = WIDGET_SECTIONS[next].statuses[0];
		pickOrder(WIDGET_SECTIONS[next].orders[0]);
		tag = '';
	}

	function pickOrder(next: string) {
		order = next;
		direction = defaultDirection(next);
	}

	function openNew() {
		editing = null;
		pickNotebook(notebooks[0]?.id ?? 0);
		open = true;
	}

	function openEdit(widget: Widget) {
		editing = widget;
		notebookId = widget.notebookId;
		section = widget.section;
		status = widget.status;
		order = widget.order;
		direction = widget.direction;
		tag = widget.tag ?? '';
		open = true;
	}

	/*
	 * Arriving from the phone's "reconfigure" opens that widget's own form;
	 * arriving from a new widget opens a new one. Once, on arrival — and after
	 * the router is up: a form is a history entry (`BackCloses`), and pushing
	 * one while the page is still hydrating throws.
	 */
	let arrived = false;
	afterNavigate(() => {
		if (arrived || !slot) return;
		arrived = true;
		const mine = reconfiguring ? widgets.find((one) => one.id === reconfiguring) : null;
		if (mine) openEdit(mine);
		else if (notebooks.length > 0) openNew();
	});

	/*
	 * The key goes to the phone the only way it can: through the copy of the
	 * app the phone carries, which has the bridge — see `/widget`. An edit
	 * made from the phone goes back the same way, without a key, so the
	 * widget reads again.
	 */
	function handoff(answer: Record<string, unknown> | undefined): string | null {
		const made = answer?.created as { id: number; token: string; origin: string; slot: string };
		const changed = answer?.updated as { origin: string; slot: string } | undefined;
		const to = new URL(WIDGET_HANDOFF_PATH, DEVICE_ORIGIN);
		if (made?.slot) {
			to.searchParams.set(HANDOFF_AT, made.origin);
			to.searchParams.set(HANDOFF_KEY, made.token);
			to.searchParams.set(HANDOFF_SLOT, made.slot);
			to.searchParams.set(HANDOFF_WIDGET, String(made.id));
			return to.href;
		}
		if (changed?.slot) {
			to.searchParams.set(HANDOFF_AT, changed.origin);
			return to.href;
		}
		return null;
	}

	function statusLabel(value: string): string {
		return STATUS_LABELS[value] ? t(STATUS_LABELS[value]) : value;
	}
	function orderLabel(value: string): string {
		return ORDER_LABELS[value] ? t(ORDER_LABELS[value]) : value;
	}

	function describe(widget: Widget): string {
		const parts = [
			statusLabel(widget.status),
			`${orderLabel(widget.order)} ${t(DIRECTION_LABELS[widget.direction])}`
		];
		if (widget.tag) parts.push(`#${widget.tag}`);
		return parts.join(' · ');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;
		if (open || deleting) return;
		const action = getAction(PAGE, e.key);
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			if (widgets.length === 0) return;
			cursor = Math.min(
				Math.max(cursor + (action === 'navigate-down' ? 1 : -1), 0),
				widgets.length - 1
			);
		} else if (action === 'edit' && widgets[cursor]) {
			e.preventDefault();
			openEdit(widgets[cursor]);
		} else if (action === 'delete' && widgets[cursor]) {
			// Arms the confirmation; the deletion is still a press.
			e.preventDefault();
			deleting = widgets[cursor];
		} else if (action === 'new' && slot && notebooks.length > 0) {
			e.preventDefault();
			openNew();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<SettingGroup
	title={t('widgets.notebookWidgets')}
	description={t('widgets.notebookWidgetsDescription')}
	id="notebook-widgets"
>
	{#snippet actions()}
		{#if slot && notebooks.length > 0}
			<button type="button" class="btn btn-sm" onclick={openNew}>
				<Icon name="plus" />
				{t('widgets.newWidget')}
				<kbd>{keyFor(PAGE, 'new')}</kbd>
			</button>
		{/if}
	{/snippet}

	<div data-tour="widgets-list" class="divide-y divide-gray-200">
		{#if widgets.length > 0}
			<p class="px-4 py-2 text-xs text-gray-500">
				{t('widgets.count', { count: widgets.length })} ·
				<kbd>{keyFor(PAGE, 'navigate-down')}</kbd>/<kbd>{keyFor(PAGE, 'navigate-up')}</kbd>
				<kbd>{keyFor(PAGE, 'edit')}</kbd>
			</p>
		{/if}
		{#each widgets as widget, at (widget.id)}
			<div
				class="list-row {cursor === at ? 'kbd-cursor' : ''}"
				use:keepInView={cursor === at}
				data-widget-row
			>
				<div class="list-row-main">
					<p class="truncate text-sm font-medium text-gray-900">
						{widget.notebookTitle} — {t(moduleMeta(widget.section).name)}
					</p>
					<p class="truncate text-xs text-gray-500">
						{describe(widget)}
						{#if !widget.connected}
							· {t('widgets.disconnected')}
						{/if}
					</p>
				</div>
				<div class="list-row-actions">
					<button
						type="button"
						class="icon-btn"
						title={t('ui.edit')}
						aria-label={t('ui.edit')}
						onclick={() => openEdit(widget)}><Icon name="edit" /></button
					>
					<button
						type="button"
						class="icon-btn icon-btn-danger"
						title={t('ui.delete')}
						aria-label={t('ui.delete')}
						onclick={() => (deleting = widget)}><Icon name="trash" /></button
					>
				</div>
			</div>
		{:else}
			<EmptyState icon="phone" title={t('widgets.none')} description={t('widgets.noneHow')} />
		{/each}
	</div>
</SettingGroup>

<Modal
	bind:open
	error={form?.message ?? null}
	title={editing ? t('widgets.editWidget') : t('widgets.newWidget')}
>
	<form
		id="widget-form"
		method="post"
		action={editing ? '?/updateWidget' : '?/createWidget'}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type !== 'success') return;
				// Left open when going to the phone: closing a form goes back in
				// history, and that would cancel the trip.
				const to = handoff(result.data);
				if (to) location.replace(to);
				else open = false;
			}}
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<input type="hidden" name="slot" value={slot} />
		<FormGrid>
			<Field label={t('widgets.notebook')} span={6}>
				<select
					name="notebookId"
					class="select w-full"
					value={notebookId}
					onchange={(e) => pickNotebook(Number(e.currentTarget.value))}
					use:autofocus
				>
					{#each notebooks as one (one.id)}
						<option value={one.id}>{one.title}</option>
					{/each}
				</select>
			</Field>
			<Field label={t('widgets.tab')} span={6}>
				<select
					name="section"
					class="select w-full"
					value={section}
					onchange={(e) => pickSection(e.currentTarget.value as WidgetSection)}
				>
					{#each chosenNotebook?.sections ?? [] as one (one)}
						<option value={one}>{t(moduleMeta(one).name)}</option>
					{/each}
				</select>
			</Field>
			<Field label={t('widgets.show')} span={6}>
				<select name="status" class="select w-full" bind:value={status}>
					{#each offer.statuses as one (one)}
						<option value={one}>{statusLabel(one)}</option>
					{/each}
				</select>
			</Field>
			<Field label={t('widgets.withTag')} span={6}>
				<!-- Always drawn, so choosing a tab without tags does not move the
				     fields under it; disabled where the tab has none. -->
				<select name="tag" class="select w-full" bind:value={tag} disabled={!offer.tags}>
					<option value="">{t('widgets.anyTag')}</option>
					{#each chosenNotebook?.tags ?? [] as one (one)}
						<option value={one}>#{one}</option>
					{/each}
				</select>
			</Field>
			<Field label={t('widgets.orderBy')} span={6}>
				<select
					name="order"
					class="select w-full"
					value={order}
					onchange={(e) => pickOrder(e.currentTarget.value)}
				>
					{#each offer.orders as one (one)}
						<option value={one}>{orderLabel(one)}</option>
					{/each}
				</select>
			</Field>
			<Field label={t('widgets.direction')} span={6}>
				<select name="direction" class="select w-full" bind:value={direction}>
					{#each WIDGET_DIRECTIONS as one (one)}
						<option value={one}>{t(DIRECTION_LABELS[one])}</option>
					{/each}
				</select>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (open = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="widget-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<Modal
	open={deleting !== null}
	onclose={() => (deleting = null)}
	error={form?.message ?? null}
	title={t('widgets.deleteWidget')}
>
	<p class="text-sm text-gray-700">{t('widgets.deleteWidgetExplained')}</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (deleting = null)}>{t('ui.cancel')}</button>
		<form
			method="post"
			action="?/deleteWidget"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					deleting = null;
					cursor = -1;
				}}
		>
			<input type="hidden" name="id" value={deleting?.id ?? ''} />
			<button class="btn btn-danger" use:armed>{t('widgets.yesDelete')}</button>
		</form>
	{/snippet}
</Modal>
