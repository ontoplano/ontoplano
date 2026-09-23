<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from '$lib/passwords';
	import { askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import Banner from '$lib/components/Banner.svelte';
	import StagingBand from '$lib/components/StagingBand.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

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

<div class="solo-screen bg-gray-50">
	<div class="solo-card sm:max-w-sm">
		<!--
			The mark above the name, the way the front door has it.

			This screen is where somebody meets the app, and it was the only one
			of those wearing the word alone: the icon on their phone, the front
			door and the instance chooser all show the mark, and the form they
			sign in on showed a typeface. Same component as everywhere else, so a
			new drawing lands here too.
		-->
		<div class="mb-6 flex items-center gap-3">
			<Logo size={36} />
			<h1 class="wordmark text-2xl text-gray-900">Ontoplano</h1>
		</div>

		{#if data.staging}
			<div class="mb-5"><StagingBand /></div>
		{/if}

		<!--
			Says which plan is being signed up for, because the price is not asked
			for until two pages later — somebody who pressed the family button
			should see that choice survived the click.
		-->
		{#if mode === 'register' && data.wantedPlan === 'family'}
			<p class="mb-5 text-sm text-gray-600">{t('login.familyPlan')}</p>
		{/if}

		{#if mode === 'register' && data.needsInvite}
			<div class="mb-5">
				<Banner kind="info" message={t('login.closedAlphaWarning')} />
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
			action={(mode === 'login'
				? '?/signIn'
				: mode === 'register'
					? '?/signUp'
					: '?/requestReset') +
				// Carried by hand: `?/signIn` replaces the whole query string,
				// so where somebody was headed is lost without this.
				(data.next && data.next !== '/' ? `&next=${encodeURIComponent(data.next)}` : '')}
			use:enhance
		>
			{#if mode === 'register' && (data.needsInvite || showInvite)}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">{t('login.invitationCode')}</span>
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
					{t('login.iHaveAnInvitationCode')}
				</button>
			{/if}
			{#if mode === 'register'}
				<label class="mb-3 block">
					<span class="text-sm font-medium text-gray-700">{t('ui.name')}</span>
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
				<span class="text-sm font-medium text-gray-700">{t('login.email')}</span>
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
					<span class="text-sm font-medium text-gray-700">{t('login.password')}</span>
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
					<span class="text-sm font-medium text-gray-700">{t('login.confirmPassword')}</span>
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
									? t('login.passwordsDoNotMatch')
									: ''
							);
						}}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			{/if}
			<button type="submit" class="btn btn-primary w-full">
				{mode === 'login'
					? t('login.signIn')
					: mode === 'register'
						? t('login.createAccount')
						: t('login.sendResetLink')}
			</button>
		</form>

		<p class="mt-4 text-center text-sm text-gray-500">
			{#if mode === 'login'}
				{#if data.canRegister}
					{t('login.noAccount')}
					<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'register')}>
						{t('login.register')}
					</button>
					&middot;
				{/if}
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'forgot')}>
					{t('login.forgotPassword')}
				</button>
			{:else}
				{t('login.haveAnAccount')}
				<button class="font-medium text-gray-900 underline" onclick={() => (mode = 'login')}>
					{t('login.signIn')}
				</button>
			{/if}
		</p>

		{#if mode === 'register' && data.isFirstAccount}
			<p class="mt-3 text-center text-xs text-gray-500">
				{t('login.thisIsTheFirstAccount')}
			</p>
		{/if}

		<!--
			The way out of the wrong instance.
			
			A sign-in screen is where somebody lands when the app sends them to an
			instance, and until this existed it was a dead end: the account you
			want is on a different ontoplano and there is no address bar in an app
			to type one into. Only inside the app, where the copy on the phone is
			one navigation away; a browser already has a way to leave a page.
		-->
		{#if inPhoneApp()}
			<p class="mt-4 text-center text-sm">
				<!-- Another origin entirely — the copy of the app on the phone —
				     which is not a route this app can resolve. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={askAgainOnThisPhone()} class="font-medium text-gray-900 underline">
					{t('login.useADifferentOntoplano')}
				</a>
			</p>
		{/if}

		<p class="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-500">
			<a href={resolve('/legal/privacy')} class="hover:text-gray-600">{t('login.privacy')}</a>
			·
			<a href={resolve('/legal/terms')} class="hover:text-gray-600">{t('login.terms')}</a>
			·
			<a href={resolve('/legal/refunds')} class="hover:text-gray-600">{t('login.refunds')}</a>
		</p>

		{#if mode === 'forgot' && !data.emailConfigured}
			<p class="mt-3 text-center text-xs text-gray-500">
				{t('login.thisServerHasNoMail')}
			</p>
		{/if}
	</div>
</div>
