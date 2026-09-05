<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageServerData, ActionData } from './$types';
	import Banner from '$lib/components/Banner.svelte';
	import TimezonePicker from '$lib/components/TimezonePicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { Theme } from '$lib/theme';

	/**
	 * First run: one question at a time.
	 *
	 * It used to be a page of five fields under one heading — a form to fill in
	 * before you have seen anything, which is exactly the shape people close. One
	 * question on screen at a time is slower to read and much faster to finish:
	 * nothing is being weighed against anything else, every step has an answer
	 * already in it, and Next is the only thing to press.
	 *
	 * ## Why every step stays in the DOM
	 *
	 * The steps are hidden with `hidden`, not removed with `{#if}`. Two reasons,
	 * and the second is the important one: an input that is not in the document
	 * is not submitted, so removing a step would silently drop its answer — and
	 * with the script off, nothing hides anything, so the whole thing degrades
	 * into the page it used to be, with one button at the bottom that works.
	 */
	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	/**
	 * The browser knows where it is; asking would be asking a question the
	 * machine can already answer. The field stays visible and editable, because
	 * a wrong guess is worse than no guess.
	 */
	let timezone = $state(
		typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
	);
	let firstDay = $state(String(data.week.firstDay));
	let template = $state('remote');

	/** The one-press assistant key, and the prompt built around it. */
	const assistantToken = $derived(
		form && 'assistantToken' in form ? (form.assistantToken as string) : null
	);
	let copiedPrompt = $state(false);

	/*
	 * Deliberately short: it connects, then hands the wheel to the assistant —
	 * whose questions it asks to keep short and precise, because a brand-new
	 * account's owner is one screen away from closing the tab.
	 */
	const assistantPrompt = $derived(
		assistantToken === null
			? ''
			: `I use ontoplano — a life management app with an MCP server. Connect to it:

  MCP endpoint:  ${data.origin}/api/mcp
  Transport:     streamable HTTP (stateless — no session, GET is not supported)
  Auth:          an Authorization: Bearer header
  Token:         ${assistantToken}

My account is brand new and empty. Interview me and set it up from my answers:
my weekly routine, standing commitments, things I keep meaning to do, what I
usually buy at the market, meals I cook. Ask short, precise questions, a few
at a time, and show me what you will write before writing it.`
	);

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(assistantPrompt);
			copiedPrompt = true;
			setTimeout(() => (copiedPrompt = false), 2000);
		} catch {
			copiedPrompt = false;
		}
	}

	/**
	 * The look, applied to the page as it is picked: a theme you cannot see is
	 * not a choice. `system` follows the device, which is the default.
	 */
	let theme = $state<Theme>(data.theme);
	const LOOKS: { key: Theme; label: string; blurb: string }[] = [
		{
			key: 'system',
			label: 'Match my device',
			blurb: 'Light by day, dark by night, if that is what your phone does.'
		},
		{ key: 'light', label: 'Light', blurb: 'Always light, whatever the device says.' },
		{ key: 'dark', label: 'Dark', blurb: 'Always dark, whatever the device says.' }
	];

	function pickTheme(key: Theme) {
		theme = key;
		if (key === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = key;
	}

	/*
	 * The rooms.
	 *
	 * Everything is on to begin with, because the honest default for somebody who
	 * has not seen the app is the whole app — and because unticking what you do
	 * not want is a smaller decision than picking eight things you cannot
	 * picture. Nothing here is permanent: preferences has the same list.
	 */
	const wanted = new SvelteSet<string>(data.rooms.map((r) => r.id));
	/** The one whose description is showing: hovered, else focused, else last chosen. */
	let describing = $state<string>(data.rooms[0]?.id ?? '');
	const described = $derived(data.rooms.find((r) => r.id === describing) ?? data.rooms[0]);

	function toggleRoom(id: string) {
		if (wanted.has(id)) wanted.delete(id);
		else wanted.add(id);
		describing = id;
	}

	// ── The steps ─────────────────────────────────────────────────────────────

	const STEPS = [
		{
			key: 'assistant',
			title: 'Use it with an AI',
			hint: 'Optional — an assistant can set your week up by asking you about it.'
		},
		{ key: 'where', title: 'Where are you?', hint: 'It decides what counts as today.' },
		{
			key: 'week',
			title: 'When does your week start?',
			hint: 'Sunday and Monday are both normal.'
		},
		{
			key: 'rooms',
			title: 'Which rooms do you want?',
			hint: 'Turn off what you will not use. You can turn any of it back on later.'
		},
		{ key: 'look', title: 'How should it look?', hint: 'It changes as you pick.' },
		{
			key: 'start',
			title: 'Start from a week?',
			hint: 'A week you can drag around beats an empty grid.'
		}
	];

	let step = $state(0);
	const last = $derived(step === STEPS.length - 1);
	let panel = $state<HTMLElement>();
	/** Off until the script runs, so a page with no JavaScript shows everything. */
	let stepping = $state(false);
	$effect(() => {
		stepping = true;
	});

	async function go(to: number) {
		step = Math.min(Math.max(to, 0), STEPS.length - 1);
		await tick();
		// The first thing on the step, so the keyboard lands where the eyes do.
		panel?.querySelector<HTMLElement>('input, select, button:not([disabled])')?.focus();
	}

	/**
	 * Enter means Next, until the last step.
	 *
	 * A form with one submit button submits on Enter from any field, which on
	 * step one would finish the whole thing with four questions unanswered.
	 */
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || !stepping || last) return;
		const target = e.target as HTMLElement;
		if (target instanceof HTMLTextAreaElement) return;
		e.preventDefault();
		void go(step + 1);
	}
</script>

<div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
	<div>
		<h1 class="text-lg font-bold text-gray-900">Welcome to ontoplano</h1>
		<p class="mt-1 text-sm text-gray-500">
			{#if stepping}
				{STEPS.length} quick steps. All of it is editable later.
			{:else}
				A few questions and a week to start from. All of it is editable later.
			{/if}
		</p>
	</div>

	{#if form?.message}
		<Banner kind="error" message={form.message} />
	{/if}

	<!-- The handler is on the wrapper rather than the form: a form is not an
	     interactive element, and Enter bubbles to it from every field anyway. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div {onkeydown}>
		<form method="post" use:enhance class="space-y-6">
			<!--
			Where you are in it, as dots rather than a number: five is few enough to
			see, and a bar that fills is a promise about how long the rest takes.
		-->
			{#if stepping}
				<ol class="flex items-center gap-2" aria-label="Progress">
					{#each STEPS as s, i (s.key)}
						<li>
							<button
								type="button"
								onclick={() => go(i)}
								disabled={i > step}
								aria-current={i === step ? 'step' : undefined}
								aria-label="{i + 1}. {s.title}"
								title={s.title}
								class="block h-2 w-8 rounded-full transition-colors {i === step
									? 'bg-gray-900'
									: i < step
										? 'bg-gray-400 hover:bg-gray-600'
										: 'bg-gray-200'}"
							></button>
						</li>
					{/each}
					<li class="ml-2 text-xs text-gray-500">Step {step + 1} of {STEPS.length}</li>
				</ol>
			{/if}

			<div bind:this={panel} class="border border-gray-200 bg-white p-6 shadow-card">
				{#each STEPS as s, i (s.key)}
					<section hidden={stepping && i !== step} class:mt-8={!stepping && i > 0}>
						<h2 class="text-base font-semibold text-gray-900">{s.title}</h2>
						<p class="mt-1 text-sm text-gray-500">{s.hint}</p>

						<div class="mt-4">
							{#if s.key === 'assistant'}
								{#if assistantToken}
									<p class="text-sm text-gray-700">
										Paste this to Claude — or anything that speaks MCP. The key is shown only now;
										revoke it any time under Settings → Integrations.
									</p>
									<div class="mt-3 flex items-start gap-2">
										<code
											class="flex-1 overflow-x-auto border border-blue-200 bg-blue-50 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-gray-900"
											>{assistantPrompt}</code
										>
										<button type="button" onclick={copyPrompt} class="btn btn-sm">
											<Icon name="copy" />
											{copiedPrompt ? 'Copied' : 'Copy'}
										</button>
									</div>
								{:else}
									<p class="text-sm text-gray-700">
										Claude — or anything that speaks MCP — can read your week and write to it, with
										a key you can revoke. It will ask about your routine and set the week up for
										you.
									</p>
									<button form="assistant-token" class="btn mt-3">
										Create the key and the prompt
									</button>
									<p class="mt-2 text-xs text-gray-500">
										Or press Next — Settings → Integrations has this whenever you want it.
									</p>
								{/if}
							{:else if s.key === 'where'}
								<div class="max-w-sm">
									<TimezonePicker
										groups={data.zones}
										bind:value={timezone}
										required
										label="Your timezone"
									/>
								</div>
							{:else if s.key === 'week'}
								<div class="flex flex-wrap gap-2">
									{#each DAYS as day, index (day)}
										<button
											type="button"
											onclick={() => (firstDay = String(index))}
											aria-pressed={firstDay === String(index)}
											class="btn btn-sm {firstDay === String(index) ? 'btn-primary' : ''}"
										>
											{day}
										</button>
									{/each}
								</div>
								<input type="hidden" name="firstDay" value={firstDay} />
							{:else if s.key === 'rooms'}
								<!--
								The picker, and the sentence beside it.

								Eight names nobody has seen mean nothing on their own — "Notebooks"
								could be anything — so the description follows the pointer and the
								keyboard, on the side where it does not move the grid about. A tick
								in the corner rather than a colour: whether a thing is on has to be
								readable without seeing hue.
							-->
								<div class="grid gap-4 md:grid-cols-[1fr_16rem]">
									<ul class="grid gap-2 sm:grid-cols-2">
										{#each data.rooms as room (room.id)}
											<li>
												<button
													type="button"
													onclick={() => toggleRoom(room.id)}
													onmouseenter={() => (describing = room.id)}
													onfocus={() => (describing = room.id)}
													aria-pressed={wanted.has(room.id)}
													class="lift relative flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm {wanted.has(
														room.id
													)
														? 'border-gray-900 bg-gray-50 font-medium text-gray-900'
														: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}"
												>
													<span class="flex-1">{room.label}</span>
													{#if wanted.has(room.id)}
														<Icon name="check" />
													{/if}
												</button>
											</li>
										{/each}
									</ul>

									<!--
										A fixed floor under it, so hovering does not resize the
										page. The descriptions are different lengths, and a panel
										that grows to fit each one makes the whole card jump about
										under the pointer — which reads as instability rather than
										as information arriving. Sized to the longest of them.
									-->
									<aside
										aria-live="polite"
										class="min-h-[15rem] rounded-md border border-gray-200 bg-gray-50 p-3 text-sm"
									>
										<p class="font-medium text-gray-900">{described?.label}</p>
										<p class="mt-1 text-gray-500">{described?.blurb}</p>
										<p class="mt-3 text-xs text-gray-500">
											{wanted.size} of {data.rooms.length} on. The planner and your week are always here.
										</p>
									</aside>
								</div>

								{#each data.rooms as room (room.id)}
									{#if wanted.has(room.id)}
										<input type="hidden" name="rooms" value={room.id} />
									{/if}
								{/each}
							{:else if s.key === 'look'}
								<div class="flex flex-wrap gap-2">
									{#each LOOKS as look (look.key)}
										<button
											type="button"
											onclick={() => pickTheme(look.key)}
											aria-pressed={theme === look.key}
											title={look.blurb}
											class="btn btn-sm {theme === look.key ? 'btn-primary' : ''}"
										>
											{look.label}
										</button>
									{/each}
								</div>
								<input type="hidden" name="theme" value={theme} />
							{:else if s.key === 'start'}
								<div class="grid gap-3 sm:grid-cols-3">
									{#each data.templates as t (t.key)}
										<label
											class="lift cursor-pointer rounded-md border p-4 {template === t.key
												? 'border-gray-900 bg-gray-50 shadow-raised'
												: 'border-gray-200 bg-white hover:bg-gray-50'}"
										>
											<input
												type="radio"
												name="template"
												value={t.key}
												checked={template === t.key}
												onchange={() => (template = t.key)}
												class="sr-only"
											/>
											<span class="block text-sm font-semibold text-gray-900">{t.label}</span>
											<span class="mt-1 block text-xs text-gray-500">{t.description}</span>
											<span class="tabular mt-2 block text-xs text-gray-500">
												{t.blocks === 0 ? 'No blocks' : `${t.blocks} blocks`}
											</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</section>
				{/each}
			</div>

			<!--
			A way past all of it. Everything here is a default that can be changed
			later, so somebody who does not want to answer five questions in their
			first minute should not have to.
		-->
			<div class="flex flex-wrap items-center justify-between gap-3">
				<button type="submit" name="skip" value="1" class="btn btn-quiet">
					Skip — I'll set this up later
				</button>

				<div class="flex items-center gap-2">
					{#if stepping && step > 0}
						<button type="button" onclick={() => go(step - 1)} class="btn">Back</button>
					{/if}
					{#if stepping && !last}
						<button type="button" onclick={() => go(step + 1)} class="btn btn-primary">Next</button>
					{:else}
						<button class="btn btn-primary">Start planning</button>
					{/if}
				</div>
			</div>
		</form>

		<!--
			The assistant key's own form. The button on the first step belongs to
			it by its form= attribute, so pressing it never submits the wizard —
			and the wizard's Enter handling never reaches it.
		-->
		<form
			id="assistant-token"
			method="post"
			action="?/assistantToken"
			use:enhance={() =>
				async ({ update }) => {
					// Keep the wizard's own answers: the default reset would blank
					// the fields of the form this one deliberately is not.
					await update({ reset: false });
				}}
		></form>
	</div>
</div>
