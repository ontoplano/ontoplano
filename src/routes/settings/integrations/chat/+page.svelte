<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Select from '$lib/components/Select.svelte';
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

	let provider = $state<string>(data.configured?.provider ?? 'anthropic');
	const chosen = $derived(providerOf(provider));
	const showForm = $derived(!data.configured || editing);
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
								autocomplete="off"
								spellcheck={false}
								class="input font-mono"
								required
								maxlength={300}
							/>
						</Field>
					{/if}

					<Field
						label={t('settings.integrations.chat.model')}
						span={chosen?.editableBaseUrl ? 4 : 6}
						required={!chosen?.defaultModel}
						hint={chosen?.defaultModel
							? t('settings.integrations.chat.emptyMeans', { model: chosen.defaultModel })
							: ''}
					>
						<OneLine
							name="model"
							autocomplete="off"
							spellcheck={false}
							class="input font-mono"
							placeholder={chosen?.modelHint ?? ''}
							required={!chosen?.defaultModel}
							maxlength={100}
						/>
					</Field>

					{#if chosen?.editableBaseUrl}
						<Field
							label={t('settings.integrations.chat.baseUrl')}
							span={8}
							hint={t('settings.integrations.chat.emptyMeans', {
								model: OLLAMA_DEFAULT_BASE_URL
							})}
						>
							<OneLine
								name="baseUrl"
								autocomplete="off"
								spellcheck={false}
								class="input font-mono"
								placeholder={OLLAMA_DEFAULT_BASE_URL}
								maxlength={200}
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
