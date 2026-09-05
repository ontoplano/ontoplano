<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '$lib/passwords';
	import Banner from '$lib/components/Banner.svelte';
	import StagingBand from '$lib/components/StagingBand.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	// Null means "whatever this instance opens on": the first account lands on
	// the register form, everybody else on sign-in.
	type Tab = 'login' | 'register' | 'forgot';

	// Which form opens. Read once on purpose: an instance with no accounts opens
	// on register, because there is nobody to sign in as yet, and after that the
	// choice is the visitor's.
	// svelte-ignore state_referenced_locally
	let mode: Tab = $state(
		data.isFirstAccount || data.openRegister || data.invite ? 'register' : 'login'
	);

	/**
	 * Whether the code field is on the screen.
	 *
	 * Open registration takes a code and does not require one, so the field is
	 * behind a line of text: a required box for something almost nobody has is a
	 * box almost everybody has to read and ignore. A code that arrived as a link
	 * opens it already filled.
	 */
	// svelte-ignore state_referenced_locally
	let showInvite = $state(Boolean(data.invite));
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">ontoplano</h1>

		{#if data.staging}
			<div class="mb-5"><StagingBand /></div>
		{/if}

		<!--
			Says which plan is being signed up for, because the price is not asked
			for until two pages later — somebody who pressed the family button
			should see that choice survived the click.
		-->
		{#if mode === 'register' && data.wantedPlan === 'family'}
			<p class="mb-5 text-sm text-gray-600">Family plan.</p>
		{/if}

		{#if mode === 'register' && data.needsInvite}
			<div class="mb-5">
				<Banner
					kind="info"
					message="Ontoplano is in a closed alpha — registering takes an invitation code. Accounts made now are real: your data is kept, through the alpha and after it."
				/>
			</div>
		{/if}

		{#if form?.message && !form?.success}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if form?.success && form.action === 'requestReset'}
			<div class="mb-4"><Banner kind="success" message={form.message} /></div>
		{/if}

		<form
			method="post"
			action={mode === 'login' ? '?/signIn' : mode === 'register' ? '?/signUp' : '?/requestReset'}
			use:enhance
		>
			{#if mode === 'register' && (data.needsInvite || showInvite)}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">Invitation code</span>
					<input
						name="invite"
						type="text"
						required={data.needsInvite}
						value={data.invite}
						autocomplete="off"
						class="tabular mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{:else if mode === 'register'}
				<button
					type="button"
					onclick={() => (showInvite = true)}
					class="mb-3 text-sm text-gray-500 underline underline-offset-2 hover:text-gray-900"
				>
					I have an invitation code
				</button>
			{/if}
			{#if mode === 'register'}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">Name</span>
					<input
						name="name"
						type="text"
						required
						autocomplete="name"
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
					autocomplete="email"
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
						minlength={mode === 'register' ? MIN_PASSWORD_LENGTH : 3}
						autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
					<!-- The rule before it is broken, not only as a refusal after. The
					     old `minlength=3` on a NEW password was also just wrong. -->
					{#if mode === 'register'}
						<span class="mt-1 block text-xs text-gray-500">{PASSWORD_RULE}</span>
					{/if}
				</label>
			{/if}
			{#if mode === 'register'}
				<label class="mb-4 block">
					<span class="text-sm font-medium text-gray-700">Confirm password</span>
					<input
						name="confirm"
						type="password"
						required
						minlength={MIN_PASSWORD_LENGTH}
						autocomplete="new-password"
						oninput={(e) => {
							const field = e.currentTarget;
							const password = field.form?.elements.namedItem('password') as HTMLInputElement;
							// The browser's own refusal, at the field, before the round trip.
							field.setCustomValidity(
								password && field.value && field.value !== password.value
									? 'The two passwords are not the same.'
									: ''
							);
						}}
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
			·
			<a href={resolve('/legal/refunds')} class="hover:text-gray-600">Refunds</a>
		</p>

		{#if mode === 'forgot' && !data.emailConfigured}
			<p class="mt-3 text-center text-xs text-gray-500">
				This server has no mail configured, so the link will be written to its log rather than sent.
			</p>
		{/if}
	</div>
</div>
