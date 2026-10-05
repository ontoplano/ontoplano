<script lang="ts">
	import { dateOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { MARK_CLIP_PATH, MARK_EDGE_COLOURS, MARK_FIELD } from '$lib/logo/mark-shape';
	import { formatPrice, tierPricing, yearlyParts, type Pricing } from '$lib/plans';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';
	import { fromPlayStore } from '$lib/platform';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	/**
	 * Which way money goes. Only the copy installed from Google Play can open
	 * Play's purchase sheet, and it says so in its user agent; when it is that
	 * copy, the checkout action routes to Play Billing instead of minting a
	 * provider transaction.
	 */
	let payChannel = $state('');
	$effect(() => {
		if (fromPlayStore()) payChannel = 'play';
	});
	/** The billing page's rule, on the other page that charges: inside the
	 * installed app with no Play sheet, nothing here may open a checkout. */
	const moneyStays = $derived(data.inApp && payChannel !== 'play');

	/*
	 * Which plan is being bought, here on the page where it is bought.
	 *
	 * It opens on whatever was chosen on the front page and stays changeable:
	 * somebody who came for the family plan should not have to buy one seat and
	 * then upgrade, and somebody who came for one seat should still be able to
	 * see there is a household rate before they pay rather than after.
	 */
	let tier = $state<'solo' | 'family'>(data.wanted);
	const familyOffered = $derived(data.pricing.familyMonthlyCents > 0);
	const prices = $derived(tierPricing(data.pricing, familyOffered ? tier : 'solo'));
	const yearly = $derived(yearlyParts(prices));

	/*
	 * How often, as a choice rather than as two buttons.
	 *
	 * It used to be the two submit buttons themselves — a filled blue slab
	 * saying "Yearly — …" above a quiet one saying "Monthly — …" — so the
	 * loudest thing on a page about which plan to have was which billing
	 * period, and the plan tiles above it read as a preamble. Both questions
	 * are the same kind of question and they are asked the same way now, and
	 * the one thing shaped like "money moves when you press this" is the
	 * single button underneath.
	 */
	let interval = $state<'yearly' | 'monthly'>('yearly');

	/** The cheapest way to have a plan, for its tile: the yearly rate if there is one. */
	function fromMonthly(p: Pricing): string {
		const cents = p.yearlyCents > 0 ? Math.round(p.yearlyCents / 12) : p.monthlyCents;
		return formatPrice(cents, p.currency);
	}
	const soloFrom = $derived(fromMonthly(tierPricing(data.pricing, 'solo')));
	const familyFrom = $derived(fromMonthly(tierPricing(data.pricing, 'family')));

	/*
	 * The page wears the mark.
	 *
	 * Everything coloured here is the octagon's own ring — its eight edges and
	 * the dark field inside it — read from the measured artwork rather than
	 * typed, so a new logo repaints the page that sells it. The ring is drawn
	 * again, segment by segment, as the badge each plan carries and as the
	 * strip under the button that takes the money.
	 */
	const brand = [
		`--mark-field: ${MARK_FIELD}`,
		`--mark-clip: ${MARK_CLIP_PATH}`,
		...MARK_EDGE_COLOURS.map((c, i) => `--edge-${i}: ${c}`),
		`--ring-strip: linear-gradient(90deg, ${MARK_EDGE_COLOURS.map(
			(c, i) =>
				`${c} ${((i / MARK_EDGE_COLOURS.length) * 100).toFixed(1)}% ${(((i + 1) / MARK_EDGE_COLOURS.length) * 100).toFixed(1)}%`
		).join(', ')})`
	].join('; ');

	/** How far the inner edge of a badge's ring sits, as a share of its outer one. */
	const RING_INNER = 0.72;

	/**
	 * One edge of the octagon as a quad, for the badge's ring. Vertex `k` sits
	 * at -90° + 45°·k, which puts a corner at the top the way the mark has one,
	 * and edge `i` runs from the corner before it to corner `i` — red is the
	 * upper-left edge, as it is in the artwork.
	 */
	function ringEdge(i: number): string {
		const n = MARK_EDGE_COLOURS.length;
		const corner = (k: number, r: number) => {
			const a = ((-90 + (360 / n) * k) * Math.PI) / 180;
			return `${(50 + 50 * r * Math.cos(a)).toFixed(2)},${(50 + 50 * r * Math.sin(a)).toFixed(2)}`;
		};
		const from = (i + n - 1) % n;
		return [corner(from, 1), corner(i, 1), corner(i, RING_INNER), corner(from, RING_INNER)].join(
			' '
		);
	}
	const ringEdges = MARK_EDGE_COLOURS.map((colour, i) => ({ colour, points: ringEdge(i) }));

	const planTiles = $derived([
		{
			id: 'solo' as const,
			icon: 'user' as const,
			name: t('start.justMe'),
			seats: t('start.1Account'),
			from: soloFrom
		},
		{
			id: 'family' as const,
			icon: 'home' as const,
			name: t('start.family'),
			seats: t('start.accounts', { familySeats: data.pricing.familySeats }),
			from: familyFrom
		}
	]);

	function when(iso: string): string {
		return dateOf(iso, now(), { month: 'long' });
	}

	/**
	 * A paid checkout resolves by webhook, seconds after the browser is back —
	 * polling until the hold clears means the server-side redirect fires on
	 * its own instead of showing a stale card page.
	 */
	$effect(() => {
		let polls = 0;
		const timer = setInterval(() => {
			polls += 1;
			if (polls > 20) clearInterval(timer);
			else invalidateAll();
		}, 3000);
		return () => clearInterval(timer);
	});

	/**
	 * One export per click.
	 *
	 * It used to be a link, which the client router tried to route to — the
	 * export is an endpoint, not a page, so the first tap raised a navigation
	 * error instead of downloading, and only the second one appeared to work.
	 * A plain form submits natively, and the guard below disarms the button
	 * for the same gesture rather than for a re-render: two of a day's two
	 * exports must not go to one impatient double-tap.
	 */
	let exporting = $state(false);

	function startExport(event: SubmitEvent) {
		if (exporting) {
			event.preventDefault();
			return;
		}
		exporting = true;
		// After the submission is under way, so the button is still enabled at
		// the moment the browser reads the form.
		setTimeout(() => (exporting = false), 6000);
	}
</script>

{#snippet ring()}
	<svg viewBox="0 0 100 100" class="block h-full w-full">
		{#each ringEdges as edge (edge.colour)}
			<polygon points={edge.points} fill={edge.colour} />
		{/each}
	</svg>
{/snippet}

<div class="solo-screen start-screen bg-gray-100" style={brand}>
	<div class="solo-card start-card sm:max-w-md">
		<!-- The ring, unrolled: the first thing on the page is the mark's colours. -->
		<div class="start-strip" aria-hidden="true"></div>
		<div class="mb-4"><Logo size={44} /></div>
		{#if data.mode === 'expired'}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">
				{t('start.yourSubscriptionEnded')}
			</h1>
			<p class="text-sm text-gray-700">
				{t('start.everythingYouWroteIsKept')}
			</p>
		{:else if data.trialDaysAhead > 0}
			<!-- The promise is the heading. "Your 14 free days" named the offer;
			     what the person at a card form wants said first is that pressing
			     a button here costs nothing. -->
			<h1 class="mb-4 text-2xl font-bold tracking-tight text-gray-900">
				{t('start.nothingIsChargedToday')}
			</h1>
			<p class="text-sm text-gray-700">
				<strong class="text-gray-900"
					>{t('start.youGetFreeDaysEvenIf', { trialDaysAhead: data.trialDaysAhead })}</strong
				><br />
				{t('start.ifNotTheFirstCharge', { firstChargeOn: when(data.firstChargeOn) })}
			</p>
		{:else}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">{t('start.subscribe')}</h1>
			<p class="text-sm text-gray-700">{t('start.billedTodayTheTrial')}</p>
		{/if}

		<!-- What the money is actually for — said before it is asked for. -->
		<p class="mt-3 text-sm text-gray-500">
			{t('start.ontoplanoIsFreeAndOpen')}
		</p>

		{#if form && 'message' in form && form.message}
			<div class="mt-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if familyOffered}
			<!--
				Two questions, two shapes — the shapes every payment page uses.

				Which plan comes first: two tiles on the mark's own dark field, each
				wearing the octagon as its badge and a half of the ring as its
				colour — the warm edges for one person, the cool ones for a
				household — so the two read as two things rather than one square
				twice. The border is always two pixels, transparent or painted, and
				every line is drawn in both states, so choosing one moves nothing:
				it only lights the one chosen.
			-->
			<div class="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('start.plan')}>
				{#each planTiles as plan (plan.id)}
					<button
						type="button"
						role="radio"
						onclick={() => (tier = plan.id)}
						aria-checked={tier === plan.id}
						class="plan-tile plan-tile-{plan.id}"
					>
						<span class="plan-tick" aria-hidden="true"><Icon name="check" size={14} /></span>
						<span class="plan-emblem" aria-hidden="true">
							<span class="plan-badge">
								<span class="absolute inset-0">{@render ring()}</span>
								<Icon name={plan.icon} size={28} />
							</span>
						</span>
						<span class="plan-name">{plan.name}</span>
						<span class="plan-seats">{plan.seats}</span>
						<span class="plan-price">
							<span class="plan-from">{t('start.from')}</span>
							<span class="plan-amount tabular">{plan.from}</span>
							<span class="plan-from">{t('start.perMonth')}</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if moneyStays}
			<p class="mt-3 text-sm text-gray-600">{t('start.aSubscriptionCannotBeStarted')}</p>
		{:else}
			{#if data.yearly && prices.yearlyCents > 0 && yearly}
				<!--
					How often, in the same shape as which plan, and quieter: a detail
					of the choice above rather than a second one as loud.

					Each tile carries the same three lines — a month's price, the
					year's — so the two compare at a glance, and the saving hangs on
					the yearly one's top edge, where it costs the layout nothing.
					The prices are rewritten when the plan above changes; nothing
					grows or shrinks.
				-->
				<div class="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('start.howOften')}>
					<button
						type="button"
						role="radio"
						onclick={() => (interval = 'yearly')}
						aria-checked={interval === 'yearly'}
						class="cycle-tile"
					>
						<span class="cycle-ribbon">{t('start.percentOff', { saving: yearly.saving })}</span>
						<span class="cycle-name">{t('start.everyYear')}</span>
						<span class="cycle-price">
							<span class="tabular text-xl font-bold text-gray-900">{yearly.month}</span>
							<span class="text-xs text-gray-600">{t('start.perMonth')}</span>
						</span>
						<span class="tabular text-xs text-gray-600"
							>{t('start.aYear', { currency: yearly.year })}</span
						>
					</button>
					<button
						type="button"
						role="radio"
						onclick={() => (interval = 'monthly')}
						aria-checked={interval === 'monthly'}
						class="cycle-tile"
					>
						<span class="cycle-name">{t('start.everyMonth')}</span>
						<span class="cycle-price">
							<span class="tabular text-xl font-bold text-gray-900"
								>{formatPrice(prices.monthlyCents, prices.currency)}</span
							>
							<span class="text-xs text-gray-600">{t('start.perMonth')}</span>
						</span>
						<span class="tabular text-xs text-gray-600"
							>{t('start.aYear', {
								currency: formatPrice(prices.monthlyCents * 12, prices.currency)
							})}</span
						>
					</button>
				</div>
			{/if}

			<!-- Full page post on purpose: the answer is a redirect into checkout. -->
			<form method="post" action="?/checkout" class="mt-5">
				<input type="hidden" name="tier" value={familyOffered ? tier : 'solo'} />
				<input type="hidden" name="channel" value={payChannel} />
				<input
					type="hidden"
					name="interval"
					value={data.yearly && prices.yearlyCents > 0 ? interval : 'monthly'}
				/>
				<!-- The one thing on the page shaped like money moving, and the
				     loudest: the mark's field with its ring running underneath. -->
				<button class="start-cta">
					{data.trialDaysAhead > 0
						? t('start.startFreeDays', { count: data.trialDaysAhead })
						: t('start.start')}
					<Icon name="arrow-right" size={18} />
				</button>
			</form>
		{/if}

		{#if familyOffered}
			<!-- Always in the layout, shown only for the family plan: picking a
			     plan must not shove the buttons below it around. -->
			<p
				class="mt-2 text-xs text-gray-500 {tier === 'family' ? '' : 'invisible'}"
				aria-hidden={tier !== 'family'}
			>
				{t('start.oneInvoiceCoversAccountsYours', { familySeats: data.pricing.familySeats })}
			</p>
		{/if}

		{#if data.mode === 'expired'}
			{#if data.exportsLeft > 0}
				<!-- A native GET, not a routed link: the target is an endpoint. -->
				<form
					method="get"
					action={resolve('/settings/account/export')}
					onsubmit={startExport}
					class="mt-3"
				>
					<button
						type="submit"
						disabled={exporting}
						class="w-full border border-gray-300 px-4 py-2.5 text-center text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
					>
						{exporting ? 'Exporting…' : t('start.downloadYourDataJson')}
					</button>
				</form>
			{:else}
				<p class="mt-3 text-xs text-gray-500">
					{t('start.bothOfTodaySExportsAre')}
				</p>
			{/if}
		{/if}

		{#if data.demo}
			<!--
				The way out that is not "sign out".

				Somebody who reached a card without having seen the thing has two
				options here otherwise: pay, or leave. A demo is the third — a real
				button rather than a line of small print, since for the undecided it
				is the most useful thing on the page — and it opens in a tab of its
				own so this page is still behind it.
			-->
			<!-- An address on another host, so `resolve` has nothing to do with
			     it — the rule is about this app's own routes. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<!-- Deliberately not button-shaped: the buttons above take money, and
			     nothing that does not may dress like them. -->
			<a
				href={data.demo}
				target="_blank"
				rel="noopener"
				class="mt-5 block text-center text-sm font-medium text-gray-700 underline underline-offset-4 transition hover:text-gray-900"
			>
				{t('start.letMeSeeTheDemo')}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}

		<div class="mt-6 space-y-3 border-t border-gray-200 pt-4 text-xs text-gray-500">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<p>
				<a
					href="https://docs.ontoplano.com/running-it"
					target="_blank"
					rel="noopener"
					class="underline hover:text-gray-900"
				>
					{t('start.iWantToHostMy')}
				</a>
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<form method="post" action="/login?/signOut" use:enhance>
				<button type="submit" class="underline">{t('start.signOut')}</button>
			</form>
		</div>
	</div>
</div>

<style>
	/*
	 * The card page is the one screen in the app allowed to be loud about
	 * colour: it is where somebody decides whether to pay for it. The colours
	 * are still not new ones — every one is an edge of the mark's octagon,
	 * handed in as `--edge-0` … `--edge-7` and `--mark-field` from the measured
	 * artwork. Text never sits on a bright edge; it sits on the field, or on
	 * the page's own surface.
	 */
	.start-screen {
		--glow: 16%;
		--rim: transparent;
		background-image:
			radial-gradient(
				60rem 40rem at 0% 0%,
				color-mix(in srgb, var(--edge-1) var(--glow), transparent),
				transparent 70%
			),
			radial-gradient(
				50rem 40rem at 100% 20%,
				color-mix(in srgb, var(--edge-6) var(--glow), transparent),
				transparent 70%
			),
			radial-gradient(
				60rem 40rem at 50% 110%,
				color-mix(in srgb, var(--edge-4) var(--glow), transparent),
				transparent 70%
			);
	}

	/* On a dark page the field is nearly the card's own colour: a rim keeps
	   the button a button. */
	:global(html[data-theme='dark']) .start-screen {
		--glow: 10%;
		--rim: rgb(255 255 255 / 0.14);
	}

	@media (prefers-color-scheme: dark) {
		:global(html:not([data-theme='light'])) .start-screen {
			--glow: 10%;
			--rim: rgb(255 255 255 / 0.14);
		}
	}

	.start-card {
		position: relative;
		overflow: hidden;
	}

	/* The ring, unrolled across the card's top edge. */
	.start-strip {
		position: absolute;
		inset: 0 0 auto;
		height: 6px;
		background-image: var(--ring-strip);
	}

	/* ─── Which plan ─────────────────────────────────────────────────────── */

	.plan-tile {
		--accent: var(--edge-1);
		--edge: linear-gradient(135deg, var(--edge-0), var(--edge-1), var(--edge-2));
		--rest: rgb(255 255 255 / 0.1);
		--lit: 0;
		position: relative;
		display: flex;
		overflow: hidden;
		min-height: 13rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		border: 2px solid transparent;
		/*
		 * Three layers: the accent's glow, the field, and — in the border box —
		 * either a faint rim or the accent's own edge. The border is always two
		 * pixels; only what is painted in it changes.
		 */
		background:
			radial-gradient(
					circle at 85% 0%,
					color-mix(in srgb, var(--accent) calc(18% + var(--lit) * 22%), transparent),
					transparent 65%
				)
				padding-box,
			linear-gradient(var(--mark-field), var(--mark-field)) padding-box,
			linear-gradient(var(--rest), var(--rest)) border-box,
			linear-gradient(var(--mark-field), var(--mark-field)) border-box;
		color: #fff;
		padding: 1.25rem 0.5rem 1rem;
		text-align: center;
		box-shadow: var(--shadow-card);
		transition:
			transform 120ms ease,
			box-shadow 120ms ease,
			opacity 120ms ease;
	}

	.plan-tile-family {
		--accent: var(--edge-5);
		--edge: linear-gradient(135deg, var(--edge-4), var(--edge-5), var(--edge-6), var(--edge-7));
	}

	.plan-tile:hover {
		--rest: rgb(255 255 255 / 0.28);
	}

	.plan-tile[aria-checked='true'] {
		--lit: 1;
		background:
			radial-gradient(
					circle at 85% 0%,
					color-mix(in srgb, var(--accent) 40%, transparent),
					transparent 65%
				)
				padding-box,
			linear-gradient(var(--mark-field), var(--mark-field)) padding-box,
			var(--edge) border-box;
		box-shadow:
			0 10px 28px -10px color-mix(in srgb, var(--accent) 70%, transparent),
			var(--shadow-card);
	}

	/* The badge, and the room around it. */
	.plan-emblem {
		position: relative;
		display: grid;
		width: 4rem;
		height: 4rem;
		margin-bottom: 0.5rem;
		place-items: center;
	}

	/* The octagon as a badge: the ring's eight edges around the field. */
	.plan-badge {
		position: relative;
		display: grid;
		width: 4rem;
		height: 4rem;
		place-items: center;
		clip-path: var(--mark-clip);
		background-color: var(--mark-field);
		color: #fff;
		transition: transform 240ms ease;
	}

	.plan-badge > :global(svg) {
		position: relative;
	}

	.plan-tile[aria-checked='true'] .plan-badge {
		transform: rotate(45deg);
	}

	/* Turned back inside, so the octagon goes round and the glyph stays upright. */
	.plan-tile[aria-checked='true'] .plan-badge > :global(svg) {
		transform: rotate(-45deg);
	}

	/* Always drawn, so choosing a tile never adds anything to it. */
	.plan-tick {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: grid;
		width: 1.5rem;
		height: 1.5rem;
		place-items: center;
		clip-path: var(--mark-clip);
		background: #fff;
		color: var(--mark-field);
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.plan-tile[aria-checked='true'] .plan-tick {
		opacity: 1;
		transform: none;
	}

	.plan-name {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.2;
	}

	.plan-seats {
		font-size: 0.75rem;
		color: #c9d1d7;
	}

	.plan-price {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 0.5rem;
		line-height: 1.1;
	}

	.plan-amount {
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.plan-from {
		font-size: 0.75rem;
		color: #c9d1d7;
	}

	/* ─── How often ──────────────────────────────────────────────────────── */

	.cycle-tile {
		--edge: linear-gradient(90deg, var(--edge-6), var(--edge-5));
		--rest: var(--color-gray-200);
		--face: var(--color-white);
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		border: 2px solid transparent;
		background:
			linear-gradient(var(--face), var(--face)) padding-box,
			linear-gradient(var(--rest), var(--rest)) border-box;
		padding: 1rem 0.5rem 0.75rem;
		text-align: center;
		transition: box-shadow 120ms ease;
	}

	.cycle-tile:hover {
		--rest: var(--color-gray-400);
	}

	.cycle-tile[aria-checked='true'] {
		--face: color-mix(in srgb, var(--edge-5) 8%, var(--color-white));
		background:
			linear-gradient(var(--face), var(--face)) padding-box,
			var(--edge) border-box;
		box-shadow: var(--shadow-raised);
	}

	.cycle-name {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-gray-700);
	}

	.cycle-price {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	/* The saving hangs on the edge — outside the flow, so it moves nothing. */
	.cycle-ribbon {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translate(-50%, -60%);
		background-image: linear-gradient(90deg, var(--edge-6), var(--edge-5));
		/* White on the two darkest edges clears 4.5:1 at both ends. */
		color: #fff;
		padding: 0.125rem 0.625rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* ─── The button ─────────────────────────────────────────────────────── */

	.start-cta {
		--strip: 4px;
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 0;
		background:
			var(--ring-strip) bottom / 100% var(--strip) no-repeat,
			var(--mark-field);
		color: #fff;
		padding: 0.9rem 1rem calc(0.9rem + 4px);
		font-size: 1rem;
		font-weight: 700;
		box-shadow:
			inset 0 0 0 1px var(--rim),
			0 12px 28px -12px color-mix(in srgb, var(--edge-6) 60%, transparent),
			var(--shadow-card);
		cursor: pointer;
		transition:
			background-size 120ms ease,
			transform 120ms ease,
			box-shadow 120ms ease;
	}

	.start-cta:hover {
		/* The padding already holds room for it, so the button does not grow. */
		--strip: 6px;
		box-shadow:
			inset 0 0 0 1px var(--rim),
			0 16px 32px -12px color-mix(in srgb, var(--edge-6) 75%, transparent),
			var(--shadow-raised);
	}

	.start-cta:focus-visible {
		outline: 2px solid var(--edge-5);
		outline-offset: 2px;
	}

	:global(html[data-style='playful']) .plan-tile,
	:global(html[data-style='playful']) .cycle-tile,
	:global(html[data-style='playful']) .start-cta {
		border-radius: var(--radius-md);
	}

	@media (prefers-reduced-motion: no-preference) {
		.plan-tile:hover,
		.start-cta:hover {
			transform: translateY(-2px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.plan-badge,
		.plan-tick {
			transition: none;
		}
	}
</style>
