<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';

	/**
	 * What `/` is when nobody is signed in.
	 *
	 * It used to be the whole pitch — headline, price, video, the argument for
	 * self-hosting. That page moved to ontoplano.com, which is a different
	 * repository and a different audience: somebody who has not decided yet.
	 * What is left here is a door, and it has to work for two people at once.
	 *
	 * On the hosted instance it is where an old bookmark lands, and the useful
	 * thing is a way in. On somebody else's instance — the ordinary case, since
	 * anybody may run this — a pitch would be absurd: they installed it, they
	 * are not being sold anything, and the marketing of a project they merely
	 * chose to run is nobody's business on their own machine.
	 *
	 * So: the name, one line about what it is, and the two doors. The link out
	 * is to the project, not to a price.
	 */
	let {
		canRegister = false,
		tagline
	}: {
		canRegister?: boolean;
		/** The instance's own line, from config.toml. See `DEFAULT_TAGLINE`. */
		tagline: string;
	} = $props();
</script>

<div
	class="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center"
>
	<Logo size={44} />

	<h1 class="mt-5 text-2xl font-bold text-gray-900">ontoplano</h1>
	<p class="mt-2 text-base text-gray-600">{tagline}</p>

	<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
		{#if canRegister}
			<a href="{resolve('/login')}?register" class="btn btn-primary">Create an account</a>
		{/if}
		<a href={resolve('/login')} class="btn">Sign in</a>
	</div>

	{#if !canRegister}
		<!--
			Said plainly rather than left as a missing button.

			An instance with registration closed is the normal, deliberate state —
			most of these have exactly one person in them — and somebody who
			arrives at one should learn that, not wonder where the button went.
		-->
		<p class="mt-4 text-sm text-gray-500">
			This instance is not taking new accounts. Its owner can invite you.
		</p>
	{/if}

	<p class="mt-10 text-sm text-gray-500">
		<a
			class="underline underline-offset-2 hover:text-gray-900"
			href="https://ontoplano.com"
			rel="external">What ontoplano is</a
		>
		·
		<a
			class="underline underline-offset-2 hover:text-gray-900"
			href="https://docs.ontoplano.com"
			rel="external">How it works</a
		>
	</p>
</div>
