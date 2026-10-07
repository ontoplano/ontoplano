<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { dateOf, momentOf } from '$lib/when';
	import Kbd from '$lib/components/Kbd.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$lib/enhance';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import Field from '$lib/components/Field.svelte';
	import KeyReach from '$lib/components/KeyReach.svelte';
	import PermissionGrid from '$lib/components/PermissionGrid.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { listCursor } from '$lib/actions/list-cursor';
	import type { StreamDisplay, StreamKind } from '$lib/services/streams';
	import type { PlainKey } from '$lib/i18n/keys';
	import { useT } from '$lib/i18n';
	import { callLine } from '$lib/assistant-calls';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showTokenForm = $state(false);
	let showWebhookForm = $state(false);
	let confirmRevoke = $state<number | null>(null);
	let confirmDeleteStream = $state<number | null>(null);
	let confirmDeleteWebhook = $state<number | null>(null);
	let selectedIndex = $state(-1);

	const newToken = $derived(form?.success && form.action === 'createToken' ? form.token : null);
	const newFeedUrl = $derived(
		form?.success && form.action === 'calendarLink' ? form.feedUrl : null
	);
	/** A hook's signing secret, the once it is ever shown. */
	const newWebhookSecret = $derived(
		form?.success && form.action === 'createWebhook' ? form.secret : null
	);

	/** What the key being made is tied to; the grid fades what that leaves out. */
	let tiedTo = $state('');
	let tiedId = $state('');
	const reachableFor = (kind: string | null | undefined) =>
		kind ? (data.reach.find((choice) => choice.kind === kind)?.scopes ?? []) : null;
	const carriedFor = (kind: string | null | undefined) =>
		kind ? (data.reach.find((choice) => choice.kind === kind)?.carried ?? null) : null;

	/** The key whose permissions are open, read-only. */
	let viewing = $state<(typeof data.tokens)[number] | null>(null);

	function closeForms() {
		showTokenForm = false;
		showWebhookForm = false;
		confirmRevoke = null;
		confirmDeleteStream = null;
		confirmDeleteWebhook = null;
	}

	/** How a stream can be drawn, in words rather than its stored value. */
	const DISPLAY_LABELS: Record<StreamDisplay, PlainKey> = {
		line_chart: 'settings.integrations.connections.displayLine',
		bar_chart: 'settings.integrations.connections.displayBars',
		calendar_heatmap: 'settings.integrations.connections.displayCalendar',
		latest_value: 'settings.integrations.connections.displayLatest',
		list: 'settings.integrations.connections.displayList'
	};

	// What a stream is, in words: the stored value is for plugins, not people.
	const KIND_LABELS: Record<StreamKind, PlainKey> = {
		measurement: 'settings.integrations.connections.kindMeasurement',
		event: 'settings.integrations.connections.kindEvent',
		counter: 'settings.integrations.connections.kindCounter',
		state: 'settings.integrations.connections.kindState'
	};

	/*
	 * A stream's settings are sent a moment after the last change rather than
	 * on each one: a held arrow on the days box is a change per step.
	 */
	const SAVE_AFTER_MS = 500;
	const pending = new WeakMap<HTMLFormElement, ReturnType<typeof setTimeout>>();
	function saveSoon(form: HTMLFormElement) {
		clearTimeout(pending.get(form));
		pending.set(
			form,
			setTimeout(() => form.requestSubmit(), SAVE_AFTER_MS)
		);
	}

	const eventLabel = (key: string) => {
		const says = data.webhookEvents.find((e) => e.key === key)?.says;
		return says ? t(says) : key;
	};

	/**
	 * The two things somebody pastes, with the token already in them.
	 *
	 * The same words as `docs/prose/ai-agents.md`, at the moment the token
	 * exists — a token that is shown once, so sending somebody to the docs to
	 * fetch a prompt and back again is three steps at the one moment they
	 * cannot afford to lose this tab. The endpoint is this instance's own,
	 * because a self-hosted copy is not app.ontoplano.com.
	 */
	function mcpCommand(token: string): string {
		return `claude mcp add --transport http ontoplano ${data.origin}/api/mcp \\\n  --header "Authorization: Bearer ${token}"`;
	}

	function mcpPrompt(token: string): string {
		return `I use ontoplano — a life management app with an MCP server. Please connect to it
and use it whenever I ask you about my week, my todos, my diary, my notebooks,
my shopping list or my recipes.

  MCP endpoint:  ${data.origin}/api/mcp
  Transport:     streamable HTTP (stateless — no session, GET is not supported)
  Auth:          an Authorization: Bearer header

Once connected, list the tools you were offered and tell me what I asked you to
do today. Do not write anything into my account until I ask you to.

Token: ${token}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			closeForms();
			return;
		}
		const action = getAction('/settings/integrations/connections', e);
		if (action === 'new' && !showTokenForm) {
			e.preventDefault();
			showTokenForm = true;
			return;
		}
		if (action === 'navigate-down') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, data.tokens.length - 1);
		}
		if (action === 'navigate-up') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	{#if newToken}
		<!-- Shown once, with the two things somebody is about to paste it into
		     already carrying it: sending them to the docs and back is three steps
		     at the one moment they cannot afford to lose the tab. -->
		<Banner kind="success">
			<p class="font-semibold">{t('settings.integrations.connections.tokenCreatedCopyIt')}</p>
			<div class="mt-2">
				<CopyBlock text={newToken.plaintext} label={t('ui.copy')} wrap={false} />
			</div>
			<details class="mt-3">
				<summary class="cursor-pointer text-xs font-medium text-gray-900">
					{t('settings.integrations.connections.connectAnAiAssistantWith')}
				</summary>
				<p class="mt-2 text-xs text-gray-600">
					{t('settings.integrations.connections.oneCommandIfItHas')}
				</p>
				<div class="mt-1">
					<CopyBlock text={mcpCommand(newToken.plaintext)} label={t('ui.copy')} wrap={false} />
				</div>
				<p class="mt-3 text-xs text-gray-600">
					{t('settings.integrations.connections.orPasteThisToIt')}
				</p>
				<div class="mt-1">
					<CopyBlock text={mcpPrompt(newToken.plaintext)} label={t('ui.copy')} />
				</div>
			</details>
			<p class="mt-3 text-xs">
				<a
					href="https://docs.ontoplano.com/ai-agents"
					target="_blank"
					rel="noreferrer"
					class="underline underline-offset-2"
				>
					{t('settings.integrations.connections.howOntoplanoSMcpServerWorks')}
				</a>
			</p>
		</Banner>
	{/if}

	<!-- One surface, a subject per band — the shape every settings screen
	     shares. See `SettingGroup` and `SettingRow`. -->
	<RoomSurface>
		<!--
			The calendar link, first: the one thing on this page an ordinary
			person wants. Paste a URL into the calendar they already use and their
			plan turns up there, with nothing of ours in the way.
		-->
		<SettingGroup
			title={t('settings.integrations.connections.calendarLink')}
			description={t('settings.integrations.connections.pasteTheAddressIntoGoogle')}
		>
			{#if newFeedUrl}
				<div class="px-4 py-3">
					<p class="mb-2 text-sm font-medium text-gray-900">
						{t('settings.integrations.connections.yourNewCalendarAddress')}
					</p>
					<CopyBlock text={newFeedUrl} label={t('ui.copy')} />
				</div>
			{/if}
			<!--
				Anyone holding the address can read the plan — that is how every
				calendar subscription works — so it is said before it is made.
				Named, because five rows called "Calendar link" are five rows
				nobody can revoke with any confidence.
			-->
			<SettingRow
				label={t('settings.integrations.connections.whereItIsGoing')}
				hint={t('settings.integrations.connections.anyoneWithTheAddressCan')}
			>
				{#if data.calendarLinks.length >= data.calendarLinkLimit}
					<p class="mt-1 text-sm text-gray-500">
						{t('settings.integrations.connections.isTheMostRevoke', {
							calendarLinkLimit: data.calendarLinkLimit
						})}
					</p>
				{/if}
				{#snippet control()}
					<form method="post" action="?/calendarLink" use:enhance class="flex items-center gap-2">
						<OneLine
							name="label"
							placeholder={t('settings.integrations.connections.myPhone')}
							class="input input-sm w-40"
							ariaLabel={t('settings.integrations.connections.whereItIsGoing')}
							maxlength={60}
						/>
						<button
							class="btn btn-sm shrink-0"
							disabled={data.calendarLinks.length >= data.calendarLinkLimit}
						>
							<Icon name="plus" />
							{t('settings.integrations.connections.createACalendarLink')}
						</button>
					</form>
				{/snippet}
			</SettingRow>
		</SettingGroup>

		<!--
			The way in that needs no key, above the tokens because it is the path
			most people should take — and because the flow starts on the
			assistant's side, where nobody thinks to look first.
		-->
		<SettingGroup title={t('settings.integrations.connections.connectAnAssistant')}>
			<SettingRow
				wide
				label={t('settings.integrations.connections.pasteThisAddressInto')}
				hint={t('settings.integrations.connections.itSendsYouBackHere')}
			>
				{#snippet control()}
					<div class="w-full max-w-3xl">
						<CopyBlock text="{data.origin}/api/mcp" label={t('ui.copy')} wrap={false} />
					</div>
				{/snippet}
			</SettingRow>
		</SettingGroup>

		<SettingGroup
			title={t('settings.integrations.connections.apiTokens')}
			description="{t('settings.integrations.connections.connectExternalAppsTheyPush')} {t(
				'settings.integrations.connections.streams'
			)} {t('settings.integrations.connections.andCanReadYourUpcoming')}"
		>
			{#snippet actions()}
				<button
					type="button"
					onclick={() => (showTokenForm = true)}
					class="btn btn-sm"
					data-tour="integrations-tokens"
				>
					<Icon name="plus" />
					{t('settings.integrations.connections.newToken')}
					<Kbd keys={keyFor('/settings/integrations/connections', 'new')} />
				</button>
			{/snippet}
			{#each data.tokens as token, i (token.id)}
				<div class="list-row" data-row use:listCursor={selectedIndex === i}>
					<div class="list-row-main">
						<p class="truncate text-sm font-medium text-gray-900">{token.name}</p>
						<!--
							A calendar link shows its whole address; every other token shows
							the six characters that identify it and nothing more. That
							difference is the difference between the two kinds of credential.
						-->
						{#if token.feedUrl}
							<div class="mt-1 max-w-3xl">
								<CopyBlock text={token.feedUrl} label={t('ui.copy')} />
							</div>
						{:else if token.scopes.includes('calendar:read')}
							<!-- Made before addresses were kept, so this one genuinely cannot
							     be shown again. Said, rather than left looking broken. -->
							<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
							<p class="mt-0.5 text-xs text-gray-500">
								{t('settings.integrations.connections.thisAddressWasNotKept')}
							</p>
						{:else}
							<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
						{/if}
						{#if token.tiedTo}
							<!-- A tied key says less about what it does than about how little
							     of the account it can see. -->
							<p class="mt-1 text-xs text-gray-700">
								{t('settings.integrations.connections.tiedToOne')}
								<strong class="font-semibold">{token.tiedTo}</strong>
							</p>
						{/if}
						<!-- What it may do is one press away, drawn as the grid it was made
						     with, rather than every sentence run together here. -->
						<p class="mt-1 text-xs text-gray-500">
							{#if token.lastUsedAt}
								{t('settings.integrations.connections.lastUsed')}
								{momentOf(token.lastUsedAt, now())}
							{:else}
								{t('settings.integrations.connections.neverUsed')}
							{/if}
							{#if token.expiresAt}
								{t('settings.integrations.connections.expires')} {dateOf(token.expiresAt, now())}
							{/if}
						</p>
					</div>
					<form method="post" action="?/revokeToken" use:enhance class="list-row-actions">
						<input type="hidden" name="id" value={token.id} />
						<button
							type="button"
							onclick={() => (viewing = token)}
							class="icon-btn"
							title={t('settings.integrations.connections.permissions')}
							aria-label={t('settings.integrations.connections.permissions')}
						>
							<Icon name="shield" />
						</button>
						{#if confirmRevoke === token.id}
							<button type="submit" class="btn btn-danger btn-sm" use:armed>
								{t('settings.integrations.connections.revoke')}
							</button>
							<button
								type="button"
								onclick={() => (confirmRevoke = null)}
								class="icon-btn"
								title={t('ui.cancel')}
								aria-label={t('ui.cancel')}><Icon name="close" /></button
							>
						{:else}
							<button
								type="button"
								onclick={() => (confirmRevoke = token.id)}
								class="icon-btn icon-btn-danger"
								title={t('settings.integrations.connections.revoke')}
								aria-label={t('settings.integrations.connections.revoke')}
							>
								<Icon name="trash" />
							</button>
						{/if}
					</form>
				</div>
			{:else}
				<div class="px-4">
					<EmptyState
						icon="key"
						title={t('settings.integrations.connections.noTokensYetCreate')}
						compact
					/>
				</div>
			{/each}
			<!-- What every token shares, under the tokens rather than as a band
			     at the foot of the page. -->
			<div class="max-w-3xl space-y-1 px-4 py-3 text-xs text-gray-500">
				<p>{t('settings.integrations.connections.theLimitsATokenMay')}</p>
				<p>
					{t('settings.integrations.connections.writingAPluginSee')}
					<a
						href="https://github.com/ontoplano/ontoplano/blob/master/docs/PLUGINS.md"
						rel="external"
						class="underline underline-offset-2 hover:text-gray-900"
					>
						{t('settings.integrations.connections.docsPluginsMd')}
					</a>
					{t('settings.integrations.connections.onGithub')}
				</p>
			</div>
		</SettingGroup>

		<!--
			What the assistants did.

			Every MCP write answers the caller with the state it replaced, but that
			answer goes to whoever holds the transcript — and the owner of the data
			holds none. This is their copy, with a way back for the calls that
			deleted something.
		-->
		{#if data.assistantCalls.length > 0}
			<SettingGroup
				title={t('settings.integrations.connections.whatYourAssistantsDid')}
				description={t('settings.integrations.connections.theLastWritesMadeOver')}
			>
				<!--
					The switch beside the list it is about. Turning it off is not
					turning off the log — the writes are still recorded and shown;
					nobody is buzzed about them. A switch rather than a button whose
					words flipped between "Stop telling me" and "Tell me".
				-->
				<SettingRow label={t('settings.integrations.connections.tellMeWhenThisHappens')}>
					{#snippet control()}
						<!-- Not reset after it posts: the live stream can land the new value
						     first, and a reset then would put the switch back to off under it. -->
						<form
							method="post"
							action="?/notifyAssistant"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="on" value={data.notifyAssistant ? 'false' : 'true'} />
							<input
								type="checkbox"
								class="toggle"
								checked={data.notifyAssistant}
								aria-label={t('settings.integrations.connections.tellMeWhenThisHappens')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
						</form>
					{/snippet}
				</SettingRow>
				{#each data.assistantCalls as one (one.id)}
					<div class="list-row">
						<div class="list-row-main flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
							<span class="tabular shrink-0 text-xs text-gray-500">
								{momentOf(one.createdAt, now())}
							</span>
							<code class="shrink-0 font-mono text-xs text-gray-900">{one.tool}</code>
							<span class="min-w-0 flex-1 truncate text-sm text-gray-700">
								{callLine(one)}
								{#if one.tokenName}
									<span class="text-xs text-gray-500">· {one.tokenName}</span>
								{/if}
							</span>
						</div>
						{#if one.destroyed}
							<div class="list-row-actions">
								{#if one.restoredAt}
									<span class="text-xs text-gray-500"
										>{t('settings.integrations.connections.putBack')}</span
									>
								{:else}
									<form method="post" action="?/putBack" use:enhance>
										<input type="hidden" name="id" value={one.id} />
										<button
											type="submit"
											class="icon-btn"
											title={t('settings.integrations.connections.putItBack')}
											aria-label={t('settings.integrations.connections.putItBack')}
										>
											<Icon name="undo" />
										</button>
									</form>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</SettingGroup>
		{/if}

		<SettingGroup
			title={t('settings.integrations.connections.dataStreams')}
			description={t('settings.integrations.connections.createdAutomaticallyWhenAnExternal')}
			dataTour="integrations-streams"
		>
			{#each data.streams as stream (stream.id)}
				<div class="list-row">
					<div class="list-row-main">
						<a
							href={resolve('/data/[slug]', { slug: stream.slug })}
							class="text-sm font-medium text-gray-900 underline underline-offset-2"
						>
							{stream.name}
						</a>
						<p class="mt-0.5 font-mono text-xs text-gray-500">{stream.slug}</p>
						<p class="mt-1 text-xs text-gray-500">
							{t(KIND_LABELS[stream.kind])}{stream.unit ? ` · ${stream.unit}` : ''} · {stream.stats
								.count}
							{t('settings.integrations.connections.points')}
							{#if stream.stats.latest}
								{t('settings.integrations.connections.latest')}
								{dateOf(stream.stats.latest.at, now())}
							{/if}
						</p>
						<!--
							Saved as it is changed, like every other setting: a tick of its
							own on each row was a second step nobody expected.
						-->
						<form
							method="post"
							action="?/updateStream"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
								}}
							onchange={(e) => saveSoon(e.currentTarget)}
							class="controls-sm mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"
						>
							<input type="hidden" name="id" value={stream.id} />
							<input type="hidden" name="label" value={stream.name} />
							<select
								name="display"
								class="select w-auto"
								aria-label={t('settings.integrations.connections.display')}
							>
								{#each data.displays as display (display)}
									<option value={display} selected={stream.display === display}
										>{t(DISPLAY_LABELS[display])}</option
									>
								{/each}
							</select>
							<label class="flex items-center gap-1.5 text-sm text-gray-700">
								<input
									type="checkbox"
									class="toggle"
									name="showOnDashboard"
									checked={stream.showOnDashboard}
								/>
								{t('settings.integrations.connections.dashboard')}
							</label>
							<label
								class="flex items-center gap-1.5 text-sm text-gray-700"
								title={t('settings.integrations.connections.pointsOlderThanThisAre')}
							>
								{t('settings.integrations.connections.keep')}
								<NumberBox
									name="retentionDays"
									min="1"
									max="3650"
									value={stream.retentionDays ?? ''}
									class="w-20"
								/>
								{t('settings.integrations.connections.days')}
							</label>
						</form>
					</div>
					<form
						data-leaves
						method="post"
						action="?/deleteStream"
						use:enhance
						class="list-row-actions"
					>
						<input type="hidden" name="id" value={stream.id} />
						{#if confirmDeleteStream === stream.id}
							<button type="submit" class="btn btn-danger btn-sm" use:armed
								>{t('settings.integrations.connections.confirmThisDeletesPoints', {
									count: stream.stats.count
								})}</button
							>
							<button
								type="button"
								onclick={() => (confirmDeleteStream = null)}
								class="icon-btn"
								title={t('ui.cancel')}
								aria-label={t('ui.cancel')}><Icon name="close" /></button
							>
						{:else}
							<button
								type="button"
								onclick={() => (confirmDeleteStream = stream.id)}
								class="icon-btn icon-btn-danger"
								title={t('settings.integrations.connections.deleteStream')}
								aria-label={t('settings.integrations.connections.deleteStream')}
							>
								<Icon name="trash" />
							</button>
						{/if}
					</form>
				</div>
			{:else}
				<div class="px-4 pb-3">
					<EmptyState
						icon="plug"
						title={t('settings.integrations.connections.noStreamsYet')}
						compact
					/>
					<p class="text-xs text-gray-500">
						{t('settings.integrations.connections.anAppDeclaresAStream')}
						<code class="border border-gray-200 bg-gray-50 px-1 font-mono text-xs"
							>{t('settings.integrations.connections.apiV1Streams', { origin: data.origin })}</code
						>
						{t('settings.integrations.connections.withATokenThatHas')}
						<code class="font-mono">{t('settings.integrations.connections.streamsWrite')}</code>
						{t('settings.integrations.connections.scope')}
					</p>
				</div>
			{/each}
		</SettingGroup>

		<SettingGroup
			title={t('settings.integrations.connections.webhooks')}
			description={t('settings.integrations.connections.aUrlOfYoursThat')}
		>
			{#snippet actions()}
				<button type="button" onclick={() => (showWebhookForm = true)} class="btn btn-sm">
					<Icon name="plus" />
					{t('settings.integrations.connections.newWebhook')}
				</button>
			{/snippet}
			{#each data.webhooks as hook (hook.id)}
				<div class="list-row">
					<div class="list-row-main">
						<p class="text-sm font-medium break-all text-gray-900">{hook.url}</p>
						<p class="mt-1 text-xs text-gray-500">
							{t('settings.integrations.connections.when')}
							{new Intl.ListFormat(t.locale, { type: 'disjunction' }).format(
								hook.events.map(eventLabel)
							)}
							{#if hook.disabled}
								· <span class="font-medium text-gray-900"
									>{t('settings.integrations.connections.gaveUpAfterRepeatedFailures')}</span
								>
							{:else if hook.lastDeliveryAt}
								{t('settings.integrations.connections.lastDelivery')}
								{momentOf(hook.lastDeliveryAt, now())}
								({hook.lastStatus ?? t('settings.integrations.connections.unreachable')})
							{:else}
								{t('settings.integrations.connections.nothingDeliveredYet')}
							{/if}
						</p>
						<!-- Enough to tell which secret this is, never enough to sign with:
						     the whole one is shown once, when the hook is made. -->
						<p class="mt-1 text-xs text-gray-500">
							{t('settings.integrations.connections.secret')}
							<code class="font-mono">{hook.secretHint}</code>
						</p>
					</div>
					<div class="list-row-actions">
						{#if hook.disabled}
							<form method="post" action="?/reviveWebhook" use:enhance>
								<input type="hidden" name="id" value={hook.id} />
								<button
									type="submit"
									class="icon-btn"
									title={t('settings.integrations.connections.tryAgain')}
									aria-label={t('settings.integrations.connections.tryAgain')}
									><Icon name="undo" /></button
								>
							</form>
						{/if}
						<form
							method="post"
							action="?/deleteWebhook"
							use:enhance
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={hook.id} />
							{#if confirmDeleteWebhook === hook.id}
								<button type="submit" class="btn btn-danger btn-sm" use:armed>
									{t('ui.delete')}
								</button>
								<button
									type="button"
									onclick={() => (confirmDeleteWebhook = null)}
									class="icon-btn"
									title={t('ui.cancel')}
									aria-label={t('ui.cancel')}><Icon name="close" /></button
								>
							{:else}
								<button
									type="button"
									onclick={() => (confirmDeleteWebhook = hook.id)}
									class="icon-btn icon-btn-danger"
									title={t('ui.delete')}
									aria-label={t('ui.delete')}><Icon name="trash" /></button
								>
							{/if}
						</form>
					</div>
				</div>
			{:else}
				<div class="px-4">
					<EmptyState
						icon="plug"
						title={t('settings.integrations.connections.noWebhooksYetAdd')}
						compact
					/>
				</div>
			{/each}
		</SettingGroup>
	</RoomSurface>

	<Modal
		bind:open={showTokenForm}
		error={form?.message}
		title={t('settings.integrations.connections.newApiToken')}
		description={t('settings.integrations.connections.shownOnceAtCreationIt')}
	>
		<form
			id="token-form"
			method="post"
			action="?/createToken"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') showTokenForm = false;
				}}
		>
			<FormGrid>
				<Field label={t('ui.name')} span={8} required>
					<OneLine
						name="label"
						placeholder={t('settings.integrations.connections.theAppOnMyPhone')}
						class="input"
						required
						maxlength={60}
					/>
				</Field>

				<Field
					label={t('settings.integrations.connections.expiresIn')}
					span={4}
					hint={t('settings.integrations.connections.daysEmptyMeansNever')}
				>
					<NumberBox
						autocomplete="off"
						name="expiresInDays"
						min="1"
						max="3650"
						placeholder={t('settings.integrations.connections.never')}
					/>
				</Field>

				<!-- What it may work on, before what it may do: the narrower answer
				     is the one that decides whether the boxes below mean anything. -->
				<div class="col-span-12">
					<KeyReach choices={data.reach} bind:kind={tiedTo} bind:id={tiedId} />
				</div>

				<fieldset class="col-span-12">
					<legend class="eyebrow text-gray-600"
						>{t('settings.integrations.connections.whatThisTokenMayDo')}</legend
					>
					<p class="mt-1 mb-2 text-xs text-gray-500">
						{t('settings.integrations.connections.grantOnlyWhatTheApp')}
					</p>
					<PermissionGrid
						scopes={data.scopes}
						reachable={reachableFor(tiedTo)}
						carried={carriedFor(tiedTo)}
						destructive
						showKeys
					/>
				</fieldset>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showTokenForm = false)}
				>{t('ui.cancel')}</button
			>
			<button type="submit" form="token-form" class="btn btn-primary"
				>{t('settings.integrations.connections.createToken')}</button
			>
		{/snippet}
	</Modal>

	<Modal
		open={viewing !== null}
		onclose={() => (viewing = null)}
		title={viewing?.name ?? ''}
		description={t('settings.integrations.connections.whatThisKeyMayDo')}
	>
		{#if viewing}
			{#if viewing.tiedTo}
				<p class="mb-3 text-sm text-gray-700">
					{t('settings.integrations.connections.tiedToOne')}
					<strong class="font-semibold">{viewing.tiedTo}</strong>
				</p>
			{/if}
			{#key viewing.id}
				<PermissionGrid
					scopes={data.scopes}
					checked={viewing.scopes}
					reachable={reachableFor(viewing.confinement?.kind)}
					carried={carriedFor(viewing.confinement?.kind)}
					readonly
					destructive
					showKeys
				/>
			{/key}
		{/if}
	</Modal>

	<Modal
		bind:open={showWebhookForm}
		error={form?.message}
		title={t('settings.integrations.connections.newWebhook')}
		description={t('settings.integrations.connections.eachDeliveryIsSignedWith')}
	>
		{#if newWebhookSecret}
			<!-- Copied now or not at all: nothing stores it back, and there is
		     no way to rotate one — a hook whose secret is lost is deleted
		     and made again. -->
			<div class="mb-4">
				<Banner kind="success">
					<p class="font-semibold">{t('settings.integrations.connections.hookCreatedCopyIts')}</p>
					<div class="mt-2">
						<CopyBlock text={newWebhookSecret} label={t('ui.copy')} wrap={false} />
					</div>
				</Banner>
			</div>
		{/if}
		<form
			id="webhook-form"
			method="post"
			action="?/createWebhook"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') showWebhookForm = false;
				}}
		>
			<FormGrid>
				<Field label={t('settings.integrations.connections.address')} span={12} required>
					<input
						autocomplete="off"
						name="url"
						type="url"
						required
						maxlength="300"
						placeholder={t('settings.integrations.connections.httpsExampleComOntoplanoHook')}
						class="input"
					/>
				</Field>

				<fieldset class="col-span-12">
					<legend class="eyebrow text-gray-600"
						>{t('settings.integrations.connections.tellItWhen')}</legend
					>
					<div class="mt-1 space-y-1">
						{#each data.webhookEvents as event (event.key)}
							<label class="flex items-start gap-2 text-sm text-gray-700">
								<input type="checkbox" name="events" value={event.key} class="mt-1" />
								<span>
									{event.says ? t(event.says) : event.key}
									<code class="ml-1 font-mono text-xs text-gray-500">{event.key}</code>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showWebhookForm = false)}
				>{t('ui.cancel')}</button
			>
			<button type="submit" form="webhook-form" class="btn btn-primary"
				>{t('settings.integrations.connections.createWebhook')}</button
			>
		{/snippet}
	</Modal>
</div>
