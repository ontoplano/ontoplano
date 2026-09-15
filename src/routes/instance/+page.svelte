<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { isIsolatedBuild } from '$lib/isolated/mode';
	import {
		ARRIVING_AT,
		ARRIVING_HOME,
		OFFICIAL_INSTANCE,
		chooseOnThisPhone,
		inPhoneApp,
		launchAddress,
		phoneInstanceExists,
		rememberInstance,
		storedInstance,
		suggestedInstance
	} from '$lib/instance-choice';

	/*
	 * Where your Ontoplano lives.
	 *
	 * The app can be two different things and the difference is not a setting
	 * buried in preferences — it decides whether there is a server at all. So
	 * it is a screen, and it is the screen you land on when you leave an
	 * instance: two squares, the same shape the subscription page uses for the
	 * same reason, and a paragraph under them that changes as you choose.
	 *
	 * The connected one starts selected, because it is what almost everybody
	 * wants and because the other one is a decision about backups that nobody
	 * should make by accident.
	 */
	type Kind = 'connected' | 'phone';
	let kind: Kind = $state('connected');
	/*
	 * The address to edit is the one you are on.
	 *
	 * The commonest reason to open this screen is that the laptop moved: the
	 * app is pointed at 192.168.1.10 and the wifi now says .23. Prefilling
	 * with what it is currently showing makes that two keystrokes; prefilling
	 * with the official address would make it a retype.
	 */
	let address = $state(startingAddress());

	function startingAddress(): string {
		const stored = storedInstance();
		if (stored) return stored;
		if (typeof location === 'undefined') return OFFICIAL_INSTANCE;
		// The app's own files are served from a local origin; that is not an
		// instance somebody types.
		return /^https?:/.test(location.origin) &&
			!/localhost|127\.0\.0\.1|^file:/.test(location.origin)
			? location.origin
			: OFFICIAL_INSTANCE;
	}

	/*
	 * A build that suggests an address fills the field with it.
	 *
	 * This is the whole of what makes the DEV app the DEV app: it carries the
	 * same copy of ontoplano as every other build and opens this screen with
	 * the laptop's address already typed. Asked for after the field already has
	 * something in it, so the screen is usable in the frame before the answer
	 * arrives, and never allowed to overwrite an address the person is editing.
	 */
	let untouched = $state(true);

	/*
	 * Arriving with the answer already given.
	 *
	 * A page on somebody else's origin cannot choose this phone — its storage is
	 * not this origin's — so leaving an instance means being sent here with the
	 * answer in the address. Recorded and acted on immediately: nobody asked to
	 * be asked twice.
	 */
	$effect(() => {
		const carried = new URLSearchParams(location.search);
		if (carried.has(ARRIVING_HOME)) {
			rememberInstance(null);
			location.replace('/');
			return;
		}
		const instance = carried.get(ARRIVING_AT);
		if (instance) {
			rememberInstance(instance);
			location.replace(launchAddress(instance));
		}
	});

	$effect(() => {
		if (storedInstance()) return;
		let alive = true;
		suggestedInstance().then((suggested) => {
			if (alive && untouched && suggested) address = suggested;
		});
		return () => {
			alive = false;
		};
	});

	/*
	 * What each answer actually costs, as a list rather than a paragraph.
	 *
	 * This is the one decision in the app that cannot be undone by pressing
	 * something else later — it decides where a year of somebody's writing
	 * lives — and a wall of prose is how people agree to things they have not
	 * read. One line per difference, in the same order for both, so the two are
	 * read against each other.
	 */
	const CHOICES = {
		connected: {
			label: 'Cloud instance',
			glyph: 'server' as const,
			heading: 'Connect to an external server',
			says: [
				{ has: true, glyph: 'link' as const, line: 'Reachable from any device' },
				{ has: true, glyph: 'archive' as const, line: 'Backed up' },
				{ has: true, glyph: 'star' as const, line: 'Works with AI assistants' },
				{ has: true, glyph: 'plug' as const, line: 'Plugins work' }
			],
			proceed: 'Connect'
		},
		phone: {
			label: 'On device',
			glyph: 'phone' as const,
			heading: 'Use Ontoplano on the phone only',
			says: [
				{ has: true, glyph: 'phone' as const, line: 'Fully offline' },
				{ has: false, glyph: 'link' as const, line: 'Cannot be reached from another device' },
				{ has: false, glyph: 'star' as const, line: 'No AI assistants' },
				{ has: false, glyph: 'archive' as const, line: 'No backups' }
			],
			proceed: 'Start isolated instance'
		}
	} as const;

	/**
	 * Whether this phone has already been an instance.
	 *
	 * It changes what the button promises: "start" is a beginning and "go to"
	 * is a return, and somebody with a month of writing on the device should not
	 * be offered the first when they mean the second. Read once, on mount —
	 * nothing on this screen changes it.
	 */
	const alreadyHere = phoneInstanceExists();

	const chosen = $derived(
		(kind as Kind) === 'phone' && alreadyHere
			? {
					...CHOICES.phone,
					says: [
						{
							has: true,
							glyph: 'phone' as const,
							line: 'This phone already has one, with whatever you put in it.'
						},
						...CHOICES.phone.says
					],
					proceed: 'Go to isolated instance'
				}
			: CHOICES[kind]
	);

	/**
	 * Whether this phone can be the instance.
	 *
	 * Either this page is already the copy the phone carries, or it is a page
	 * from somewhere else being drawn inside the app — which carries that copy
	 * one navigation away. A desktop browser is neither, and there the phone
	 * square is something to know about rather than something to press.
	 */
	const canRunHere = $derived(isIsolatedBuild() || inPhoneApp());

	function go() {
		const url = kind === 'phone' ? null : address.trim().replace(/\/+$/, '');
		if (url !== null && !/^https?:\/\/.+/.test(url)) return;

		/*
		 * A page an instance served cannot answer this question itself.
		 *
		 * Storage belongs to an origin, and the app reads its answer out of the
		 * origin its own copy is served from — so from anywhere else the answer
		 * travels as an address and is recorded on arrival. In a browser there is
		 * nowhere to arrive at and the choice is simply where to go.
		 */
		if (inPhoneApp() && !isIsolatedBuild()) {
			location.href = chooseOnThisPhone(url);
			return;
		}
		rememberInstance(url);
		location.href = url || '/';
	}
</script>

<svelte:head><title>Where your Ontoplano lives</title></svelte:head>

<div class="mx-auto w-full max-w-xl px-4 py-8">
	<h1 class="text-2xl font-bold tracking-tight text-gray-900">Where your Ontoplano lives</h1>
	<p class="mt-1 text-sm text-gray-500">You can change this later.</p>

	<!--
		Two squares, side by side, and choosing one moves nothing on the page:
		the border width is constant and the paragraph under them is a fixed
		block whichever is chosen.
	-->
	<div class="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Where it lives">
		{#each ['connected', 'phone'] as const as option (option)}
			<button
				type="button"
				role="radio"
				aria-checked={kind === option}
				onclick={() => (kind = option)}
				class="flex aspect-square flex-col items-center justify-center gap-2 border-2 px-3 text-center transition {kind ===
				option
					? 'border-gray-900 bg-gray-50'
					: 'border-gray-200 hover:border-gray-400'}"
			>
				<span class={kind === option ? 'text-gray-900' : 'text-gray-400'}>
					<Icon name={CHOICES[option].glyph} size={44} />
				</span>
				<span class="text-base font-bold text-gray-900">{CHOICES[option].label}</span>
			</button>
		{/each}
	</div>

	<!--
		What each answer costs, headed and drawn.
		
		A fixed block whichever is chosen, so choosing moves nothing under it,
		and both lists are the same length for the same reason.
		
		A glyph for the thing itself — a link for reachable, a box for backed
		up, a plug for plugins — and the same glyph on both sides, so the two
		columns are read against each other line by line. What the phone does
		not have is dimmed rather than crossed out: a red cross against three of
		four lines is an argument, and this screen is not making one. Absence is
		absence, and a greyed row says it without shouting.
	-->
	<h2 class="mt-4 text-sm font-semibold text-gray-900">{chosen.heading}</h2>
	<ul class="mt-2 min-h-36 space-y-1.5 text-sm">
		{#each chosen.says as said (said.line)}
			<li class="flex items-start gap-2.5 {said.has ? '' : 'opacity-45'}">
				<span class="mt-0.5 shrink-0 text-gray-500" aria-hidden="true">
					<Icon name={said.glyph} size={16} />
				</span>
				<span class="text-gray-700">{said.line}</span>
			</li>
		{/each}
	</ul>

	<!--
		The two answers' own field, in space kept for whichever is taller.

		The address field is two lines and a box; the sentence in its place is
		two lines; empty is neither — so without a floor here, choosing moved
		the button you were about to press, and the mark under it with them.
	-->
	<div class="mt-2 min-h-24">
		{#if kind === 'connected'}
			<label class="block text-sm">
				<!-- Without the scheme: the field below already holds the whole
			     address, and saying it twice in full reads as a mistake. -->
				<span class="text-gray-600">
					Enter any instance URL — official instance is {OFFICIAL_INSTANCE.replace(
						/^https?:\/\//,
						''
					)}
				</span>
				<OneLine
					name="instance"
					bind:value={address}
					oninput={() => (untouched = false)}
					class="input mt-1 w-full"
					placeholder={OFFICIAL_INSTANCE}
				/>
			</label>
		{:else if !canRunHere}
			<p class="text-sm text-amber-800">
				This copy of the app cannot hold an instance itself — the one that can is the app built for
				it.
			</p>
		{/if}
	</div>

	<button
		class="btn btn-primary mt-3 w-full"
		type="button"
		disabled={kind === 'phone' && !canRunHere}
		onclick={go}
	>
		{chosen.proceed}
	</button>

	<!--
		The mark, standing for whichever instance is being chosen.

		The same drawing either way, and the colour is the answer: full for one
		behind a server, drained for the copy this phone would carry — which is
		what the device's own bar and its launcher icon already say, so somebody
		meets the distinction here and recognises it later. Nothing moves when
		the choice changes; only the colour does.
	-->
	<div class="mt-10 flex justify-center">
		<Logo
			size={72}
			drained={kind === 'phone'}
			label={kind === 'phone' ? 'The instance on this device' : 'An instance behind a server'}
		/>
	</div>
</div>
