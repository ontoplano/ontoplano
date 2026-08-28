<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { createAuthClient } from 'better-auth/svelte';
	import { SOCIAL_GLYPHS, SOCIAL_LABELS, type SocialProvider } from '$lib/social';
	import StagingBand from '$lib/components/StagingBand.svelte';
	import type { PageServerData, ActionData } from './$types';

	/**
	 * The social flow is a redirect to the provider and back, which is not
	 * something a form action can do — the browser has to leave. So this one
	 * path talks to better-auth from the client, while everything else on this
	 * page stays a plain form post.
	 */
	const authClient = createAuthClient();

	function signInWith(provider: SocialProvider) {
		authClient.signIn.social({ provider, callbackURL: '/' });
	}

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	// Null means "whatever this instance opens on": the first account lands on
	// the register form, everybody else on sign-in.
	type Tab = 'login' | 'register' | 'forgot';

	// Which form opens. Read once on purpose: an instance with no accounts opens
	// on register, because there is nobody to sign in as yet, and after that the
	// choice is the visitor's.
	// svelte-ignore state_referenced_locally
	let mode: Tab = $state(data.isFirstAccount ? 'register' : 'login');
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">ontoplano</h1>

		{#if data.staging}
			<div class="mb-5"><StagingBand /></div>
		{/if}

		{#if form?.message}
			<div class="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{form.message}
			</div>
		{/if}

		{#if form?.success && form.action === 'requestReset'}
			<div class="mb-4 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
				{form.message}
			</div>
		{/if}

		<form
			method="post"
			action={mode === 'login' ? '?/signIn' : mode === 'register' ? '?/signUp' : '?/requestReset'}
			use:enhance
		>
			{#if mode === 'register' && data.needsInvite}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">Invitation code</span>
					<input
						name="invite"
						type="text"
						required
						autocomplete="off"
						class="tabular mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			{#if mode === 'register'}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">Name</span>
					<input
						name="name"
						type="text"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			<label class="mb-3 block">
				<span class="text-sm font-medium text-gray-700">Email</span>
				<input
					name="email"
					type="email"
					required
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			{#if mode !== 'forgot'}
				<label class="mb-4 block">
					<span class="text-sm font-medium text-gray-700">Password</span>
					<input
						name="password"
						type="password"
						required
						minlength="3"
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			<button
				type="submit"
				class="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
			</button>
		</form>

		<!--
			Somebody else's account, if this instance is set up for it.

			Only the providers with credentials appear: a button that opens Google
			and comes back with "invalid client" is worse than no button. Hidden
			entirely while resetting a password, which is not a thing Google can do
			for you.
		-->
		{#if data.social.length > 0 && mode !== 'forgot'}
			<div class="my-4 flex items-center gap-3">
				<span class="h-px flex-1 bg-gray-200"></span>
				<span class="text-xs text-gray-500">or</span>
				<span class="h-px flex-1 bg-gray-200"></span>
			</div>

			<div class="space-y-2">
				{#each data.social as provider (provider)}
					<button
						type="button"
						onclick={() => signInWith(provider)}
						class="flex w-full items-center justify-center gap-2 border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 transition hover:bg-gray-50"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d={SOCIAL_GLYPHS[provider]} />
						</svg>
						Continue with {SOCIAL_LABELS[provider]}
					</button>
				{/each}
			</div>
		{/if}

		<p class="mt-4 text-center text-sm text-gray-500">
			{#if mode === 'login'}
				{#if data.canRegister}
					No account?
					<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'register')}>
						Register
					</button>
					&middot;
				{/if}
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'forgot')}>
					Forgot password
				</button>
			{:else}
				Have an account?
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'login')}>
					Sign in
				</button>
			{/if}
		</p>

		{#if mode === 'register' && data.isFirstAccount}
			<p class="mt-3 text-center text-xs text-gray-500">
				This is the first account on this instance, so it owns it.
			</p>
		{/if}

		<p class="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-500">
			<a href={resolve('/legal/privacy')} class="hover:text-gray-600">Privacy</a>
			·
			<a href={resolve('/legal/terms')} class="hover:text-gray-600">Terms</a>
		</p>

		{#if mode === 'forgot' && !data.emailConfigured}
			<p class="mt-3 text-center text-xs text-gray-500">
				This server has no mail configured, so the link will be written to its log rather than sent.
			</p>
		{/if}
	</div>
</div>
