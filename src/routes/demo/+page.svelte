<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * What is happening, while it happens.
	 *
	 * The stages are honest about the order — the account exists before the week
	 * is written — and they advance on a timer rather than on progress reports,
	 * because the work is one server round trip and reporting inside it would
	 * cost more than it is worth. If it finishes early the page has already gone.
	 */
	const STAGES = ['Making you an account…', 'Filling a week in…', 'Almost there…'];
	let stage = $state(0);

	let starter = $state<HTMLFormElement>();
	let started = $state(false);

	onMount(() => {
		// Submitted from here rather than on the server so the screen is painted
		// first: the whole point is that the wait is looked at, not waited out.
		starter?.requestSubmit();
		const timer = setInterval(() => {
			stage = Math.min(stage + 1, STAGES.length - 1);
		}, 1800);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Opening the demo · ontoplano</title>
</svelte:head>

<div class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4">
	{#if form?.full}
		<div class="w-full border border-gray-200 bg-white p-6 text-center shadow-card">
			<p class="text-sm text-gray-900">The demo is full right now.</p>
			<p class="mt-2 text-sm text-gray-600">
				Every copy is in use. They are handed back a few minutes after somebody stops looking, so
				this clears on its own.
			</p>
			<a href={resolve('/demo')} class="btn btn-primary mt-4">Try again</a>
		</div>
	{:else}
		<div class="w-full border border-gray-200 bg-white p-6 shadow-card">
			<p class="text-sm font-semibold text-gray-900">Setting up a copy for you</p>
			<p class="mt-1 text-sm text-gray-600">
				Nobody else can see it, and it is deleted a few hours after you close the tab.
			</p>

			<ul class="mt-4 space-y-2">
				{#each STAGES as line, i (line)}
					<li
						class="flex items-center gap-2 text-sm {i <= stage ? 'text-gray-900' : 'text-gray-400'}"
					>
						<span
							class="h-1.5 w-1.5 shrink-0 {i < stage
								? 'bg-blue-600'
								: i === stage
									? 'bg-gray-900'
									: 'bg-gray-300'}"
						></span>
						{line}
					</li>
				{/each}
			</ul>

			<div class="mt-4 h-1 w-full overflow-hidden bg-gray-200">
				<div class="demo-bar h-full bg-gray-900"></div>
			</div>
		</div>
	{/if}

	<!--
		A real form with a real action, so this works with JavaScript off: the
		script presses it, and without one there is a button to press.
	-->
	<form
		method="post"
		bind:this={starter}
		use:enhance={() => {
			started = true;
			return async ({ update }) => update({ reset: false });
		}}
	>
		<input type="hidden" name="next" value={data.next} />
		<button class="btn btn-primary {started ? 'sr-only' : ''}">Open the demo</button>
	</form>
</div>

<style>
	/*
	 * Indeterminate on purpose: the page cannot know how far along a seed is,
	 * and a bar that pretends to would be a lie somebody could time.
	 */
	.demo-bar {
		width: 40%;
		animation: demo-slide 1.4s ease-in-out infinite;
	}

	@keyframes demo-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.demo-bar {
			width: 100%;
			animation: none;
			opacity: 0.35;
		}
	}
</style>
