<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { ArrowRight, Check, Menu, Phone, ShoppingBag, ShoppingCart, Zap } from '$lib/icons';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import logo from '$lib/assets/logo.png';

	type Variant = 'service' | 'journey' | 'marketplace';
	type Platform = {
		id: string;
		name: string;
		slug: string;
		totalAccounts: number;
		minPrice: number | null;
	};
	type NumberService = {
		serviceId: number;
		serviceName: string;
	};

	let { data }: { data: PageData } = $props();
	const user = $derived(page.data.user);
	const requestedVariant = page.url.searchParams.get('variant');
	let variant = $state<Variant>(
		requestedVariant === 'journey' || requestedVariant === 'marketplace'
			? requestedVariant
			: 'service'
	);

	let availablePlatforms = $derived(
		((data.platforms ?? []) as Platform[])
			.filter((platform) => platform.totalAccounts > 0)
			.sort((a, b) => b.totalAccounts - a.totalAccounts)
			.slice(0, 4)
	);
	let availableNumberServices = $derived(
		((data.numberServices ?? []) as NumberService[]).slice(0, 5)
	);

	function showVariant(nextVariant: Variant): void {
		variant = nextVariant;
		void goto(`/mock-home?variant=${nextVariant}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function formatPrice(price: number | null): string {
		if (!price) return 'View options';
		return `From ₦${Math.round(price).toLocaleString('en-NG')}`;
	}
</script>

<svelte:head>
	<title>Homepage concepts — FastAccs local preview</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<header
	class="mock-header"
	class:journey-header={variant === 'journey'}
	class:market-header={variant === 'marketplace'}
>
	<div class="header-inner">
		<a
			class="mock-brand"
			href={`/mock-home?variant=${variant}`}
			aria-label="Fast Accounts homepage concept"
		>
			<img src={logo} alt="" />
		</a>

		<nav class="desktop-nav" aria-label="Main navigation">
			<a href="/platforms">Accounts</a>
			<a href="/numbers">Numbers</a>
			<a href="/services">Boosting</a>
			<a href="/how-it-works">How it works</a>
		</nav>

		<div class="header-actions">
			<a class="cart-link" href="/checkout" aria-label="Shopping cart"><ShoppingCart size={20} /></a
			>
			<a class="account-link" href={user ? '/dashboard' : '/auth/login'}
				>{user ? 'Dashboard' : 'Sign in'}</a
			>
			<a class="start-link" href="/platforms">Get started</a>
			<details class="mobile-menu">
				<summary aria-label="Open navigation"><Menu size={23} /></summary>
				<div>
					<a href="/platforms">Accounts</a><a href="/numbers">Numbers</a><a href="/services"
						>Boosting</a
					><a href="/how-it-works">How it works</a><a href={user ? '/dashboard' : '/auth/login'}
						>{user ? 'Dashboard' : 'Sign in'}</a
					>
				</div>
			</details>
		</div>
	</div>
</header>

<main>
	{#if variant === 'service'}
		<section class="mock-hero hero-service">
			<div class="hero-service-inner">
				<p class="hero-eyebrow">Accounts · Numbers · Boosting</p>
				<h1>Get the digital service you need, without the runaround.</h1>
				<p class="hero-copy">
					Choose clearly, pay securely, and follow every order from one dashboard.
				</p>
				<div class="hero-service-actions">
					<a class="accounts" href="/platforms"><ShoppingBag size={19} />Browse accounts</a>
					<a class="numbers" href="/numbers"><Phone size={19} />Get a number</a>
					<a class="boosting" href="/services"><Zap size={19} />Boost an account</a>
				</div>
				<div class="hero-assurance">
					<span><Check size={15} />Clear choices</span><span
						><Check size={15} />Secure checkout</span
					><span><Check size={15} />Trackable orders</span>
				</div>
			</div>
		</section>
	{:else if variant === 'journey'}
		<section class="mock-hero hero-journey">
			<div class="hero-journey-inner">
				<div class="hero-journey-copy">
					<p class="hero-eyebrow">Simple from the first click</p>
					<h1>Your shortcut from “I need it” to “it’s done.”</h1>
					<p class="hero-copy">
						Start with your goal. FastAccs shows the right service and keeps the next step clear.
					</p>
					<a class="hero-primary" href="/how-it-works"
						>See how FastAccs works <ArrowRight size={18} /></a
					>
				</div>
				<div class="hero-choice-card">
					<p>What do you need?</p>
					<a href="/platforms"
						><ShoppingBag size={18} /><span
							><strong>A ready account</strong><small>Choose a platform and profile</small></span
						><ArrowRight size={17} /></a
					>
					<a href="/numbers"
						><Phone size={18} /><span
							><strong>A verification code</strong><small>Choose an app and country</small></span
						><ArrowRight size={17} /></a
					>
					<a href="/services"
						><Zap size={18} /><span
							><strong>More engagement</strong><small>Choose a service and quantity</small></span
						><ArrowRight size={17} /></a
					>
				</div>
			</div>
		</section>
	{:else}
		<section class="mock-hero hero-marketplace">
			<div class="hero-market-inner">
				<div>
					<p class="hero-eyebrow">The FastAccs marketplace</p>
					<h1>Digital products and services, ready when you are.</h1>
					<p class="hero-copy">
						Browse current account stock, supported verification services, and boosting options in
						one place.
					</p>
					<div class="market-hero-actions">
						<a href="/platforms">Explore the marketplace <ArrowRight size={18} /></a><a
							href="/how-it-works">How buying works</a
						>
					</div>
				</div>
				<div class="hero-market-preview">
					<p>Explore by category</p>
					<a href="/platforms"
						><span class="accounts"><ShoppingBag size={19} /></span>
						<div>
							<strong>Accounts</strong><small
								>{availablePlatforms.length > 0
									? `${availablePlatforms.length} stocked platforms shown`
									: 'Browse current stock'}</small
							>
						</div>
						<ArrowRight size={17} /></a
					>
					<a href="/numbers"
						><span class="numbers"><Phone size={19} /></span>
						<div><strong>Numbers</strong><small>Apps and countries</small></div>
						<ArrowRight size={17} /></a
					>
					<a href="/services"
						><span class="boosting"><Zap size={19} /></span>
						<div><strong>Boosting</strong><small>Profiles and posts</small></div>
						<ArrowRight size={17} /></a
					>
				</div>
			</div>
		</section>
	{/if}

	<section class="preview-bar" aria-label="Homepage concept selector">
		<div class="preview-inner">
			<div>
				<p class="preview-kicker">Local design preview</p>
				<p class="preview-note">The live homepage has not been changed.</p>
			</div>
			<div class="variant-buttons">
				<button class:active={variant === 'service'} onclick={() => showVariant('service')}
					>A · Service first</button
				>
				<button class:active={variant === 'journey'} onclick={() => showVariant('journey')}
					>B · Goal first</button
				>
				<button class:active={variant === 'marketplace'} onclick={() => showVariant('marketplace')}
					>C · Marketplace</button
				>
			</div>
		</div>
	</section>

	{#if variant === 'service'}
		<section class="concept concept-a">
			<div class="concept-inner">
				<header class="market-heading">
					<div>
						<p class="section-kicker">Available now</p>
						<h2>Choose what you need</h2>
					</div>
					<a class="all-link" href="/how-it-works">How it works <ArrowRight size={17} /></a>
				</header>

				<div class="market-grid">
					<article class="market-card market-accounts">
						<div class="market-title">
							<span><ShoppingBag size={20} /></span>
							<div>
								<p>Accounts</p>
								<small>Available catalogue</small>
							</div>
						</div>
						<div class="market-items">
							{#if availablePlatforms.length > 0}
								{#each availablePlatforms as platform}
									<a href={`/platforms/${platform.slug}`}>
										<div>
											<strong>{platform.name}</strong>
											<small>{platform.totalAccounts} in stock</small>
										</div>
										<span>{formatPrice(platform.minPrice)}</span>
									</a>
								{/each}
							{:else}
								<p class="empty-note">Open the catalogue to view current stock.</p>
							{/if}
						</div>
						<a class="market-cta" href="/platforms">View all accounts <ArrowRight size={16} /></a>
					</article>

					<article class="market-card market-numbers">
						<div class="market-title">
							<span><Phone size={20} /></span>
							<div>
								<p>Verification numbers</p>
								<small>Choose an app and country</small>
							</div>
						</div>
						<div class="chip-list">
							{#each availableNumberServices as service (service.serviceId)}
								<a href={`/numbers?service=${encodeURIComponent(service.serviceName)}`}
									>{service.serviceName}</a
								>
							{/each}
							<a href="/numbers">More services</a>
						</div>
						<a class="market-cta" href="/numbers">Browse numbers <ArrowRight size={16} /></a>
					</article>

					<article class="market-card market-boosting">
						<div class="market-title">
							<span><Zap size={20} /></span>
							<div>
								<p>Boosting</p>
								<small>For profiles and posts</small>
							</div>
						</div>
						<div class="market-items compact">
							<a href="/services/instagram?service=followers"
								><strong>Instagram followers</strong><span>View service</span></a
							>
							<a href="/services/tiktok?service=views"
								><strong>TikTok views</strong><span>View service</span></a
							>
							<a href="/services/youtube?service=subscribers"
								><strong>YouTube subscribers</strong><span>View service</span></a
							>
							<a href="/services/facebook?service=likes"
								><strong>Facebook likes</strong><span>View service</span></a
							>
						</div>
						<a class="market-cta" href="/services">View all boosting <ArrowRight size={16} /></a>
					</article>
				</div>
			</div>
		</section>
	{:else if variant === 'journey'}
		<section class="concept concept-b">
			<div class="concept-inner journey-layout">
				<header class="concept-heading left">
					<p class="section-kicker">Start with your goal</p>
					<h2>What are you here to do?</h2>
					<p>Choose the outcome you want. FastAccs will take you to the right place.</p>
				</header>

				<div class="goal-list">
					<a class="goal-row accounts" href="/platforms">
						<span class="goal-number">01</span>
						<div>
							<p>I need a ready account</p>
							<small>Browse available profiles by platform and type.</small>
						</div>
						<ArrowRight size={20} />
					</a>
					<a class="goal-row numbers" href="/numbers">
						<span class="goal-number">02</span>
						<div>
							<p>I need to verify an app</p>
							<small>Choose a service and country for a one-time code.</small>
						</div>
						<ArrowRight size={20} />
					</a>
					<a class="goal-row boosting" href="/services">
						<span class="goal-number">03</span>
						<div>
							<p>I want to grow my account</p>
							<small>Choose engagement for a public profile or post.</small>
						</div>
						<ArrowRight size={20} />
					</a>
				</div>

				<div class="journey-bottom">
					<div class="calm-card">
						<p class="section-kicker">After you choose</p>
						<h3>One familiar order journey</h3>
						<div class="calm-steps">
							<p><span>1</span>Review your selection</p>
							<p><span>2</span>Complete checkout</p>
							<p><span>3</span>Follow the order status</p>
						</div>
					</div>
					<div class="help-card">
						<p>Not sure where to begin?</p>
						<span>See a short explanation of every FastAccs service before you buy.</span>
						<a href="/how-it-works">See how it works <ArrowRight size={17} /></a>
					</div>
				</div>
			</div>
		</section>
	{:else}
		<section class="concept concept-c">
			<div class="concept-inner">
				<header class="market-heading">
					<div>
						<p class="section-kicker">Browse the marketplace</p>
						<h2>Find your next FastAccs service</h2>
						<p>See each part of the catalogue without leaving the homepage crowded.</p>
					</div>
					<a class="all-link" href="/how-it-works">How it works <ArrowRight size={17} /></a>
				</header>

				<div class="market-grid">
					<article class="market-card market-accounts">
						<div class="market-title">
							<span><ShoppingBag size={20} /></span>
							<div>
								<p>Accounts</p>
								<small>Available catalogue</small>
							</div>
						</div>
						<div class="market-items">
							{#if availablePlatforms.length > 0}
								{#each availablePlatforms as platform}
									<a href={`/platforms/${platform.slug}`}>
										<div>
											<strong>{platform.name}</strong><small
												>{platform.totalAccounts} in stock</small
											>
										</div>
										<span>{formatPrice(platform.minPrice)}</span>
									</a>
								{/each}
							{:else}
								<p class="empty-note">Open the account catalogue to view current stock.</p>
							{/if}
						</div>
						<a class="market-cta" href="/platforms">View all accounts <ArrowRight size={16} /></a>
					</article>

					<article class="market-card market-numbers">
						<div class="market-title">
							<span><Phone size={20} /></span>
							<div>
								<p>Verification numbers</p>
								<small>Choose an app and country</small>
							</div>
						</div>
						<div class="chip-list">
							{#each availableNumberServices as service (service.serviceId)}
								<a href={`/numbers?service=${encodeURIComponent(service.serviceName)}`}
									>{service.serviceName}</a
								>
							{/each}
							<a href="/numbers">More services</a>
						</div>
						<p class="market-copy">
							Open the catalogue to see supported countries and current prices.
						</p>
						<a class="market-cta" href="/numbers">Browse numbers <ArrowRight size={16} /></a>
					</article>

					<article class="market-card market-boosting">
						<div class="market-title">
							<span><Zap size={20} /></span>
							<div>
								<p>Boosting</p>
								<small>For profiles and posts</small>
							</div>
						</div>
						<div class="market-items compact">
							<a href="/services/instagram?service=followers"
								><strong>Instagram followers</strong><span>View service</span></a
							><a href="/services/tiktok?service=views"
								><strong>TikTok views</strong><span>View service</span></a
							><a href="/services/youtube?service=subscribers"
								><strong>YouTube subscribers</strong><span>View service</span></a
							><a href="/services/facebook?service=likes"
								><strong>Facebook likes</strong><span>View service</span></a
							>
						</div>
						<a class="market-cta" href="/services">View all boosting <ArrowRight size={16} /></a>
					</article>
				</div>

				<div class="market-reassurance">
					<p><Check size={17} />Your order is saved to your account</p>
					<p><Check size={17} />Status stays visible in your dashboard</p>
					<p><Check size={17} />Support is available when needed</p>
				</div>
			</div>
		</section>
	{/if}
</main>

<Footer />

<style>
	.mock-header {
		position: relative;
		z-index: 20;
		border-bottom: 1px solid var(--border);
		background: rgba(4, 9, 12, 0.97);
		color: var(--text);
	}

	.mock-header.journey-header {
		background: rgba(8, 12, 18, 0.98);
	}

	.mock-header.market-header {
		border-bottom-color: rgba(5, 212, 113, 0.22);
	}

	.header-inner {
		display: flex;
		min-height: 68px;
		max-width: 72rem;
		margin: 0 auto;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0 1rem;
	}

	.mock-brand {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.55rem;
		color: var(--primary);
		font-family: var(--font-head);
		font-size: 0.9rem;
		font-weight: 800;
		letter-spacing: 0.015em;
	}

	.mock-brand img {
		height: 30px;
		width: auto;
		object-fit: contain;
	}

	.desktop-nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.desktop-nav a {
		color: var(--text-muted);
		font-size: 0.87rem;
		font-weight: 650;
	}

	.desktop-nav a:hover {
		color: var(--text);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.cart-link {
		display: grid;
		height: 40px;
		width: 40px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 11px;
		color: var(--text-muted);
	}

	.account-link,
	.start-link {
		border-radius: 10px;
		padding: 0.65rem 0.9rem;
		font-size: 0.84rem;
		font-weight: 700;
	}

	.account-link {
		color: var(--text);
	}

	.start-link {
		border: 1px solid rgba(5, 212, 113, 0.4);
		background: rgba(5, 212, 113, 0.13);
		color: var(--primary);
	}

	.mobile-menu {
		display: none;
		position: relative;
	}

	.mobile-menu summary {
		display: grid;
		height: 40px;
		width: 40px;
		cursor: pointer;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 11px;
		list-style: none;
	}

	.mobile-menu summary::-webkit-details-marker {
		display: none;
	}

	.mobile-menu > div {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		display: grid;
		width: 210px;
		gap: 0.15rem;
		border: 1px solid var(--border);
		border-radius: 13px;
		padding: 0.55rem;
		background: var(--bg-elev-1);
		box-shadow: var(--shadow-2);
	}

	.mobile-menu a {
		border-radius: 8px;
		padding: 0.7rem 0.75rem;
		font-size: 0.86rem;
		font-weight: 600;
	}

	.mobile-menu a:hover {
		background: var(--bg-elev-2);
	}

	.mock-hero {
		position: relative;
		overflow: hidden;
		padding: clamp(3.5rem, 8vw, 6.5rem) 1rem;
		color: #fff;
	}

	.mock-hero::before {
		position: absolute;
		inset: 0;
		pointer-events: none;
		content: '';
	}

	.hero-eyebrow {
		color: var(--fa-lime-400);
		font-family: var(--font-head);
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.mock-hero h1 {
		margin-top: 0.9rem;
		font-family: var(--font-head);
		font-size: clamp(2.35rem, 6vw, 4.7rem);
		font-weight: 790;
		letter-spacing: -0.045em;
		line-height: 1.04;
	}

	.hero-copy {
		margin-top: 1.2rem;
		color: rgba(255, 255, 255, 0.72);
		font-size: clamp(1rem, 2vw, 1.15rem);
		line-height: 1.65;
	}

	.hero-service {
		background:
			radial-gradient(circle at 50% -20%, rgba(194, 219, 46, 0.18), transparent 43%),
			linear-gradient(145deg, #0d6f43, #083b2c 60%, #06271f);
	}

	.hero-service-inner {
		position: relative;
		max-width: 830px;
		margin: 0 auto;
		text-align: center;
	}

	.hero-service-actions {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin-top: 2rem;
	}

	.hero-service-actions a {
		--accent: var(--primary);
		display: inline-flex;
		min-height: 52px;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		border: 1px solid var(--accent);
		border-radius: 13px;
		background: rgba(3, 18, 12, 0.28);
		box-shadow: 0 0 18px -8px var(--accent);
		font-weight: 750;
	}

	.hero-service-actions a.accounts {
		--accent: #c2db2e;
	}
	.hero-service-actions a.numbers {
		--accent: #38bdf8;
	}
	.hero-service-actions a.boosting {
		--accent: #a78bfa;
	}

	.hero-assurance {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1.2rem;
		margin-top: 1.3rem;
		color: rgba(255, 255, 255, 0.68);
		font-size: 0.8rem;
	}

	.hero-assurance span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.hero-assurance :global(svg) {
		color: var(--fa-lime-400);
	}

	.hero-journey {
		background:
			radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.2), transparent 35%),
			linear-gradient(145deg, #071b18, #090d16 62%);
	}

	.hero-journey-inner,
	.hero-market-inner {
		position: relative;
		display: grid;
		max-width: 72rem;
		margin: 0 auto;
		grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
		align-items: center;
		gap: clamp(2rem, 6vw, 5rem);
	}

	.hero-journey-copy h1,
	.hero-market-inner h1 {
		max-width: 720px;
	}

	.hero-primary,
	.market-hero-actions a:first-child {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		margin-top: 1.7rem;
		border: 1px solid rgba(5, 212, 113, 0.4);
		border-radius: 11px;
		padding: 0.85rem 1rem;
		background: var(--btn-primary-gradient);
		color: #04140c;
		font-weight: 750;
	}

	.hero-choice-card,
	.hero-market-preview {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 19px;
		padding: 1.05rem;
		background: rgba(7, 13, 18, 0.72);
		box-shadow: 0 24px 80px -45px rgba(5, 212, 113, 0.7);
		backdrop-filter: blur(14px);
	}

	.hero-choice-card > p,
	.hero-market-preview > p {
		padding: 0.35rem 0.35rem 0.8rem;
		font-family: var(--font-head);
		font-size: 0.85rem;
		font-weight: 720;
	}

	.hero-choice-card > a,
	.hero-market-preview > a {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.7rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding: 0.85rem 0.35rem;
	}

	.hero-choice-card > a > :global(svg:first-child) {
		color: var(--primary);
	}

	.hero-choice-card strong,
	.hero-choice-card small,
	.hero-market-preview strong,
	.hero-market-preview small {
		display: block;
	}

	.hero-choice-card strong,
	.hero-market-preview strong {
		font-size: 0.88rem;
	}

	.hero-choice-card small,
	.hero-market-preview small {
		margin-top: 0.18rem;
		color: rgba(255, 255, 255, 0.58);
		font-size: 0.74rem;
	}

	.hero-marketplace {
		background:
			linear-gradient(90deg, rgba(5, 212, 113, 0.08) 1px, transparent 1px),
			linear-gradient(rgba(5, 212, 113, 0.08) 1px, transparent 1px),
			linear-gradient(145deg, #063324, #071412 62%);
		background-size:
			44px 44px,
			44px 44px,
			auto;
	}

	.hero-market-preview > a > span {
		display: grid;
		height: 38px;
		width: 38px;
		place-items: center;
		border-radius: 11px;
	}

	.hero-market-preview > a > span.accounts {
		background: rgba(194, 219, 46, 0.12);
		color: #c2db2e;
	}
	.hero-market-preview > a > span.numbers {
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
	}
	.hero-market-preview > a > span.boosting {
		background: rgba(167, 139, 250, 0.12);
		color: #a78bfa;
	}

	.market-hero-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}

	.market-hero-actions a:last-child {
		margin-top: 1.7rem;
		padding: 0.8rem 0.3rem;
		color: rgba(255, 255, 255, 0.72);
		font-weight: 700;
	}

	.preview-bar {
		position: sticky;
		top: 64px;
		z-index: 8;
		border-bottom: 1px solid var(--border);
		background: rgba(8, 13, 16, 0.96);
		backdrop-filter: blur(12px);
	}
	.preview-inner {
		display: flex;
		max-width: 72rem;
		margin: 0 auto;
		padding: 0.8rem 1rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.preview-kicker,
	.section-kicker {
		color: var(--primary);
		font-family: var(--font-head);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.preview-note {
		margin-top: 0.15rem;
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.variant-buttons {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.variant-buttons::-webkit-scrollbar {
		display: none;
	}
	.variant-buttons button {
		flex: 0 0 auto;
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 0.55rem 0.75rem;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 650;
	}
	.variant-buttons button.active {
		border-color: rgba(5, 212, 113, 0.5);
		background: rgba(5, 212, 113, 0.12);
		color: var(--primary);
	}
	.concept {
		min-height: 720px;
		padding: clamp(2.8rem, 6vw, 5rem) 1rem;
		background: var(--bg);
		color: var(--text);
	}
	.concept-inner {
		max-width: 72rem;
		margin: 0 auto;
	}
	.concept-heading {
		max-width: 700px;
		margin: 0 auto 2.2rem;
		text-align: center;
	}
	.concept-heading.left {
		margin-left: 0;
		text-align: left;
	}
	.concept-heading h2,
	.market-heading h2 {
		margin-top: 0.55rem;
		font-family: var(--font-head);
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 760;
		letter-spacing: -0.025em;
	}
	.concept-heading > p:last-child,
	.market-heading > div > p:last-child {
		margin-top: 0.8rem;
		color: var(--text-muted);
		line-height: 1.65;
	}
	.market-cta,
	.help-card a,
	.all-link {
		display: inline-flex;
		margin-top: auto;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border-radius: 10px;
		padding: 0.8rem 0.9rem;
		font-weight: 700;
	}
	.calm-steps span {
		display: grid;
		height: 30px;
		width: 30px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 9px;
		background: rgba(5, 212, 113, 0.12);
		color: var(--primary);
		font-weight: 750;
	}
	.journey-layout {
		max-width: 64rem;
	}
	.goal-list {
		display: grid;
		gap: 0.75rem;
	}
	.goal-row {
		--accent: var(--primary);
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 1rem;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1.15rem;
		background: var(--bg-elev-1);
		transition:
			border-color 160ms ease,
			transform 160ms ease;
	}
	.goal-row.accounts {
		--accent: #c2db2e;
	}
	.goal-row.numbers {
		--accent: #38bdf8;
	}
	.goal-row.boosting {
		--accent: #a78bfa;
	}
	.goal-row:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.goal-number {
		color: var(--accent);
		font-family: var(--font-head);
		font-size: 0.78rem;
		font-weight: 750;
	}
	.goal-row div p {
		font-family: var(--font-head);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.goal-row div small {
		display: block;
		margin-top: 0.25rem;
		color: var(--text-muted);
		line-height: 1.45;
	}
	.goal-row > :global(svg) {
		color: var(--accent);
	}
	.journey-bottom {
		display: grid;
		grid-template-columns: 1.25fr 0.75fr;
		gap: 1rem;
		margin-top: 1rem;
	}
	.calm-card,
	.help-card {
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1.4rem;
		background: var(--bg-elev-1);
	}
	.calm-card h3 {
		margin-top: 0.45rem;
		font-family: var(--font-head);
		font-size: 1.3rem;
		font-weight: 720;
	}
	.calm-steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.7rem;
		margin-top: 1rem;
	}
	.calm-steps p {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--text-muted);
		font-size: 0.84rem;
	}
	.help-card {
		display: flex;
		flex-direction: column;
		background: linear-gradient(145deg, rgba(99, 102, 241, 0.15), var(--bg-elev-1));
	}
	.help-card > p {
		font-family: var(--font-head);
		font-size: 1.15rem;
		font-weight: 720;
	}
	.help-card > span {
		margin-top: 0.5rem;
		color: var(--text-muted);
		line-height: 1.55;
	}
	.help-card a,
	.all-link {
		color: var(--primary);
	}
	.market-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}
	.all-link {
		flex: 0 0 auto;
		border: 1px solid rgba(5, 212, 113, 0.3);
		background: rgba(5, 212, 113, 0.1);
	}
	.market-grid {
		display: grid;
		grid-template-columns: 1.15fr 0.925fr 0.925fr;
		gap: 1rem;
	}
	.market-card {
		display: flex;
		min-height: 410px;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 17px;
		padding: 1.25rem;
		background: var(--bg-elev-1);
	}
	.market-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.market-title > span {
		display: grid;
		height: 40px;
		width: 40px;
		place-items: center;
		border-radius: 11px;
		background: rgba(5, 212, 113, 0.12);
		color: var(--primary);
	}
	.market-numbers .market-title > span {
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
	}
	.market-boosting .market-title > span {
		background: rgba(167, 139, 250, 0.12);
		color: #a78bfa;
	}
	.market-title p {
		font-family: var(--font-head);
		font-weight: 720;
	}
	.market-title small {
		color: var(--text-muted);
	}
	.market-items {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
	}
	.market-items > a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.7rem;
	}
	.market-items a div {
		min-width: 0;
	}
	.market-items strong {
		display: block;
		font-size: 0.86rem;
	}
	.market-items small {
		display: block;
		margin-top: 0.15rem;
		color: var(--primary);
		font-size: 0.72rem;
	}
	.market-items a > span {
		color: var(--text-muted);
		font-size: 0.74rem;
		text-align: right;
	}
	.market-items.compact a > span {
		color: #a78bfa;
	}
	.empty-note,
	.market-copy {
		margin-top: 1rem;
		color: var(--text-muted);
		line-height: 1.55;
	}
	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 1.2rem;
	}
	.chip-list a {
		border: 1px solid rgba(56, 189, 248, 0.25);
		border-radius: 999px;
		padding: 0.45rem 0.65rem;
		background: rgba(56, 189, 248, 0.08);
		color: #7dd3fc;
		font-size: 0.76rem;
		font-weight: 650;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}
	.chip-list a:hover {
		border-color: rgba(56, 189, 248, 0.65);
		background: rgba(56, 189, 248, 0.15);
	}
	.market-cta {
		color: var(--primary);
		padding-inline: 0;
	}
	.market-reassurance {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-top: 1rem;
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 1rem;
		color: var(--text-muted);
		font-size: 0.82rem;
	}
	.market-reassurance p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.market-reassurance :global(svg) {
		color: var(--primary);
	}
	@media (max-width: 820px) {
		.desktop-nav,
		.account-link,
		.start-link {
			display: none;
		}
		.mobile-menu {
			display: block;
		}
		.hero-journey-inner,
		.hero-market-inner {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
		.hero-service-actions {
			grid-template-columns: 1fr;
		}
		.preview-inner {
			align-items: stretch;
			flex-direction: column;
		}
		.variant-buttons {
			margin-inline: -1rem;
			padding-inline: 1rem;
		}
		.market-grid {
			grid-template-columns: 1fr;
		}
		.calm-steps,
		.market-reassurance {
			grid-template-columns: 1fr;
		}
		.journey-bottom {
			grid-template-columns: 1fr;
		}
		.market-heading {
			align-items: flex-start;
			flex-direction: column;
		}
		.market-card {
			min-height: 0;
		}
	}
	@media (max-width: 500px) {
		.header-inner {
			min-height: 62px;
		}
		.mock-brand img {
			height: 26px;
		}
		.mock-hero {
			padding-block: 3.3rem;
		}
		.mock-hero h1 {
			font-size: 2.45rem;
		}
		.hero-assurance {
			gap: 0.65rem 1rem;
		}
		.hero-choice-card,
		.hero-market-preview {
			padding: 0.85rem;
		}
		.concept {
			padding-top: 2.5rem;
		}
		.goal-row {
			grid-template-columns: auto 1fr;
		}
		.goal-row > :global(svg) {
			display: none;
		}
		.preview-note {
			display: none;
		}
	}
</style>
