<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import Select from '$lib/components/Select.svelte';
	import { deserialize } from '$app/forms';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';
	import { providerOf, OLLAMA_DEFAULT_BASE_URL } from '$lib/assistant-providers';
	import type { PageServerData, ActionData } from './$types';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/*
	 * The form is shown when there is nothing yet, and again on "Replace" —
	 * over the description rather than instead of it, so what is being
	 * replaced stays on screen while its replacement is typed.
	 */
	let editing = $state(false);
	let confirmRemove = $state(false);

	// svelte-ignore state_referenced_locally
	let provider = $state<string>(data.configured?.provider ?? 'anthropic');
	const chosen = $derived(providerOf(provider));
	const showForm = $derived(!data.configured || editing);

	/*
	 * The models this provider will actually answer to.
	 *
	 * Asked rather than typed: a text box for a model name only works for
	 * somebody who already has the provider's documentation open, and the
	 * answer changes every few months. The key on the form is what asks — it
	 * does not have to be saved first, because looking at the list is most of
	 * how you decide whether to save it.
	 */
	// Seeded once; from here the form owns them. See the note on `editing`.
	// svelte-ignore state_referenced_locally
	let baseUrl = $state(data.configured?.baseUrl ?? '');
	let models = $state<{ id: string; label: string }[]>([]);
	let asking = $state(false);
	let askFailed = $state('');
	// svelte-ignore state_referenced_locally
	let model = $state<string>(data.configured?.model ?? '');

	/** The way out for a name no list can hold: a model released this morning. */
	let typing = $state(false);
	let key = $state('');

	/**
	 * Ask the provider, with whatever the form is holding.
	 *
	 * A form action rather than a call from here: the key goes to this
	 * instance and the instance calls the company, which is the same path the
	 * chat itself takes and the only one the outbound guard covers.
	 */
	async function askForModels() {
		asking = true;
		askFailed = '';
		try {
			const body = new FormData();
			body.set('provider', provider);
			body.set('key', key);
			body.set('baseUrl', baseUrl);
			const answer = await fetch('?/models', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const said = deserialize(await answer.text());
			if (said.type === 'success' && Array.isArray(said.data?.models)) {
				models = said.data.models as { id: string; label: string }[];
				if (models.length === 0) askFailed = t('settings.integrations.chat.noModels');
			} else {
				askFailed =
					(said.type === 'failure' && typeof said.data?.message === 'string'
						? said.data.message
						: '') || t('settings.integrations.chat.couldNotAsk');
			}
		} catch {
			askFailed = t('settings.integrations.chat.couldNotAsk');
		} finally {
			asking = false;
		}
	}

	/*
	 * A key for one provider says nothing about another's models.
	 *
	 * Cleared when the provider changes, and only then: an effect that writes
	 * three pieces of state the template reads re-ran on its own writes and
	 * replaced this part of the form on every frame, which leaves a button
	 * that can be read and never pressed.
	 */
	// A marker for the effect below rather than anything rendered, so it is a
	// plain variable — the same shape `TagInput` and `MarkdownBox` use.
	// svelte-ignore state_referenced_locally
	let askedFor = provider;
	$effect(() => {
		if (provider === askedFor) return;
		askedFor = provider;
		models = [];
		askFailed = '';
		typing = false;
		model = '';
	});
</script>

<div class="space-y-6">
	<Card title={t('settings.integrations.chat.title')}>
		<p class="text-sm text-gray-600">{t('settings.integrations.chat.blurb')}</p>

		{#if data.configured}
			{@const meta = providerOf(data.configured.provider)}
			<p class="mt-3 text-sm">
				{t('settings.integrations.chat.answeringAs', {
					provider: meta?.label ?? data.configured.provider,
					prefix: data.configured.prefix || '—',
					model: data.configured.model ?? meta?.defaultModel ?? ''
				})}
			</p>

			<div class="mt-3 flex flex-wrap items-center gap-2">
				<a href={resolve('/assistant')} class="btn btn-primary btn-sm">
					{t('settings.integrations.chat.openChat')}
				</a>
				{#if !editing}
					<button type="button" class="btn btn-sm" onclick={() => (editing = true)}>
						{t('settings.integrations.chat.replaceKey')}
					</button>
				{/if}
				{#if confirmRemove}
					<form method="post" action="?/remove" use:enhance class="inline">
						<button class="btn btn-danger btn-sm" use:armed>
							{t('settings.integrations.chat.confirmRemove')}
						</button>
					</form>
					<button type="button" class="btn btn-sm" onclick={() => (confirmRemove = false)}>
						{t('ui.cancel')}
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-danger btn-sm"
						onclick={() => (confirmRemove = true)}
					>
						{t('settings.integrations.chat.removeKey')}
					</button>
				{/if}
			</div>

			<!--
				The one grant the chat is not born with.

				Every other permission an assistant holds is granted by having a
				chat at all: it reads and writes the account it belongs to. Deleting
				is the one worth asking about, because a wrong write is data that is
				wrong and a wrong delete is data that is gone — so it is off until
				somebody says otherwise, and it is here rather than decided for them.
			-->
			<form method="post" action="?/permissions" use:enhance class="mt-4">
				<label
					class="flex max-w-md items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-gray-700"
				>
					<input
						type="checkbox"
						name="mayDelete"
						value="on"
						class="mt-0.5"
						checked={data.mayDelete}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					<span>
						<strong class="font-semibold text-red-600"
							>{t('settings.integrations.chat.mayDelete')}</strong
						>
						<span class="mt-0.5 block text-xs leading-relaxed text-gray-500">
							{t('settings.integrations.chat.mayDeleteCaution')}
						</span>
					</span>
				</label>
			</form>
		{/if}

		{#if showForm}
			<form
				method="post"
				action="?/save"
				class="mt-4"
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = false;
					}}
			>
				<FormGrid>
					<Field label={t('settings.integrations.chat.provider')} span={4} required>
						<Select name="provider" bind:value={provider} required>
							{#each data.providers as one (one.id)}
								<option value={one.id}>{one.label}</option>
							{/each}
						</Select>
					</Field>

					{#if chosen?.needsKey}
						<Field label={t('settings.integrations.chat.key')} span={8} required>
							<OneLine
								name="key"
								class="input font-mono"
								required
								maxlength={300}
								bind:value={key}
							/>
						</Field>
					{/if}

					<!--
						The model, offered rather than asked for.

						Empty until the provider has been asked, because the list is
						the provider's and nothing here can guess it. The button says
						so; once it has answered, this is a menu of what that key can
						actually reach. Typing one by hand stays available for a model
						newer than the list — labelled as that, rather than as the
						normal way in.
					-->
					<Field
						label={t('settings.integrations.chat.model')}
						span={chosen?.editableBaseUrl ? 4 : 6}
						required={!chosen?.defaultModel}
					>
						<input type="hidden" name="model" value={model} />
						{#if typing || (models.length === 0 && model)}
							<OneLine
								name="modelTyped"
								class="input font-mono"
								placeholder={chosen?.modelHint ?? ''}
								maxlength={100}
								bind:value={model}
							/>
						{:else if models.length > 0}
							<Picker
								value={model}
								options={[
									{ value: '', label: t('settings.integrations.chat.pickAModel') },
									...models.map((one) => ({ value: one.id, label: one.label }))
								]}
								onpick={(next) => (model = next)}
								label={t('settings.integrations.chat.model')}
								class="w-full"
							/>
						{:else}
							<!--
								Named itself, because `Field` is a `<label>`.

								A button inside a label takes its accessible name from the
								whole label — so without this it answers to "Model Ask the
								provider what it offers Type a model name instead Empty
								means claude-sonnet-5", which is what a screen reader would
								read out and what a test cannot address. Same trap the
								markdown box's Write and Preview tabs hit.
							-->
							<button
								type="button"
								class="btn btn-sm w-full"
								aria-label={t('settings.integrations.chat.loadModels')}
								disabled={asking ||
									(chosen?.needsKey === true && key.trim() === '' && !data.configured)}
								onclick={askForModels}
							>
								{asking
									? t('settings.integrations.chat.asking')
									: t('settings.integrations.chat.loadModels')}
							</button>
						{/if}

						<div class="mt-1 flex flex-wrap items-center gap-3 text-xs">
							{#if models.length > 0}
								<button
									type="button"
									class="link"
									aria-label={t('settings.integrations.chat.loadModelsAgain')}
									onclick={() => {
										models = [];
										model = '';
									}}
								>
									{t('settings.integrations.chat.loadModelsAgain')}
								</button>
							{/if}
							<button
								type="button"
								class="link"
								aria-label={typing
									? t('settings.integrations.chat.pickFromTheList')
									: t('settings.integrations.chat.typeOneInstead')}
								onclick={() => {
									typing = !typing;
									// A refusal from the provider is about the list, and the
									// list is not what is on screen any more.
									askFailed = '';
								}}
							>
								{typing
									? t('settings.integrations.chat.pickFromTheList')
									: t('settings.integrations.chat.typeOneInstead')}
							</button>
						</div>

						{#if askFailed}
							<p class="mt-1 text-xs text-red-600">{askFailed}</p>
						{/if}
					</Field>

					{#if chosen?.editableBaseUrl}
						<Field label={t('settings.integrations.chat.baseUrl')} span={8}>
							<OneLine
								name="baseUrl"
								class="input font-mono"
								placeholder={OLLAMA_DEFAULT_BASE_URL}
								maxlength={200}
								bind:value={baseUrl}
							/>
						</Field>
					{/if}

					<div class="col-span-12 flex items-center gap-2">
						<button class="btn btn-primary btn-sm">{t('ui.save')}</button>
						{#if editing}
							<button type="button" class="btn btn-sm" onclick={() => (editing = false)}>
								{t('ui.cancel')}
							</button>
						{/if}
					</div>
				</FormGrid>
			</form>
		{/if}

		<FormError message={form?.message} />
	</Card>
</div>
