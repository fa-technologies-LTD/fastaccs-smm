<script lang="ts">
	import { ArrowRight, Phone, ShoppingBag, Zap } from '$lib/icons';
	import BrandIcon from '$lib/components/BrandIcon.svelte';
	import { getPlatformIcon } from '$lib/helpers/platformColors';

	interface PlatformData {
		id: string;
		name: string;
		slug: string;
		totalAccounts: number;
		minPrice: number | null;
	}

	type Shortcut = { label: string; href: string; iconKey: string };

	let { platforms = [] }: { platforms?: PlatformData[] } = $props();

	let featuredPlatforms = $derived.by(() =>
		[...platforms]
			.filter((platform) => platform?.slug && platform?.name && platform.totalAccounts > 0)
			.sort((a, b) => b.totalAccounts - a.totalAccounts || a.name.localeCompare(b.name))
			.slice(0, 4)
	);

	const numberShortcuts: Shortcut[] = [
		{ label: 'WhatsApp', href: '/numbers?service=1', iconKey: 'whatsapp' },
		{ label: 'Telegram', href: '/numbers?service=2', iconKey: 'telegram' },
		{ label: 'Google', href: '/numbers?service=3', iconKey: 'google' },
		{ label: 'Instagram', href: '/numbers?service=7', iconKey: 'instagram' },
		{ label: 'Facebook', href: '/numbers?service=11', iconKey: 'facebook' }
	];

	const boostingShortcuts: Shortcut[] = [
		{
			label: 'Instagram followers',
			href: '/services/instagram?service=followers',
			iconKey: 'instagram'
		},
		{ label: 'TikTok views', href: '/services/tiktok?service=views', iconKey: 'tiktok' },
		{
			label: 'YouTube subscribers',
			href: '/services/youtube?service=subscribers',
			iconKey: 'youtube'
		},
		{ label: 'Facebook likes', href: '/services/facebook?service=likes', iconKey: 'facebook' }
	];

	function formatPrice(price: number | null): string {
		if (!price) return 'View options';
		return `From ₦${Math.round(price).toLocaleString('en-NG')}`;
	}
</script>

<section class="catalogue-section" aria-labelledby="catalogue-heading">
	<div class="catalogue-inner">
		<header class="catalogue-heading">
			<p>Browse FastAccs</p>
			<h2 id="catalogue-heading">What do you need?</h2>
		</header>

		<div class="catalogue-grid">
			<article class="catalogue-card accounts-card">
				<div class="card-title">
					<span class="card-icon"><ShoppingBag size={20} /></span>
					<div>
						<h3>Accounts</h3>
						<p>Available now</p>
					</div>
				</div>

				<div class="item-list">
					{#if featuredPlatforms.length > 0}
						{#each featuredPlatforms as platform (platform.id)}
							{@const PlatformIcon = getPlatformIcon(platform.slug)}
							<a href={`/platforms/${platform.slug}`}>
								<div class="item-identity">
									<span class="app-icon account-app-icon"><PlatformIcon size={18} /></span>
									<span>
										<strong>{platform.name}</strong>
										<small>{platform.totalAccounts} in stock</small>
									</span>
								</div>
								<span>{formatPrice(platform.minPrice)}</span>
							</a>
						{/each}
					{:else}
						<p class="empty-note">View the current account catalogue.</p>
					{/if}
				</div>

				<a class="card-cta" href="/platforms">View all accounts <ArrowRight size={16} /></a>
			</article>

			<article class="catalogue-card numbers-card">
				<div class="card-title">
					<span class="card-icon"><Phone size={20} /></span>
					<div>
						<h3>Verification numbers</h3>
						<p>Choose an app and country</p>
					</div>
				</div>

				<div class="chip-list" aria-label="Popular verification services">
					{#each numberShortcuts as shortcut}
						<a href={shortcut.href}>
							<BrandIcon service={shortcut.iconKey} size={15} />
							{shortcut.label}
						</a>
					{/each}
					<a href="/numbers">More services</a>
				</div>

				<a class="card-cta" href="/numbers">Browse numbers <ArrowRight size={16} /></a>
			</article>

			<article class="catalogue-card boosting-card">
				<div class="card-title">
					<span class="card-icon"><Zap size={20} /></span>
					<div>
						<h3>Boosting</h3>
						<p>For profiles and posts</p>
					</div>
				</div>

				<div class="item-list compact">
					{#each boostingShortcuts as shortcut}
						{@const PlatformIcon = getPlatformIcon(shortcut.iconKey)}
						<a href={shortcut.href}>
							<div class="item-identity">
								<span class="app-icon boosting-app-icon"><PlatformIcon size={17} /></span>
								<strong>{shortcut.label}</strong>
							</div>
							<span>View service</span>
						</a>
					{/each}
				</div>

				<a class="card-cta" href="/services">View all boosting <ArrowRight size={16} /></a>
			</article>
		</div>
	</div>
</section>

<style>
	.catalogue-section {
		padding: clamp(2.75rem, 6vw, 4.75rem) 1rem;
		background: var(--bg);
		color: var(--text);
	}

	.catalogue-inner {
		max-width: 72rem;
		margin: 0 auto;
	}

	.catalogue-heading {
		margin-bottom: 1.6rem;
		text-align: center;
	}

	.catalogue-heading p {
		color: var(--primary);
		font-family: var(--font-head);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.catalogue-heading h2 {
		margin-top: 0.45rem;
		font-family: var(--font-head);
		font-size: clamp(1.85rem, 4vw, 2.55rem);
		font-weight: 760;
		letter-spacing: -0.025em;
	}

	.catalogue-grid {
		display: grid;
		grid-template-columns: 1.15fr 0.925fr 0.925fr;
		gap: 1rem;
	}

	.catalogue-card {
		display: flex;
		min-height: 390px;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 17px;
		padding: 1.25rem;
		background: var(--bg-elev-1);
		transition:
			border-color 160ms ease,
			transform 160ms ease;
	}

	.catalogue-card:hover {
		border-color: rgba(5, 212, 113, 0.36);
		transform: translateY(-1px);
	}

	.card-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.card-icon {
		display: grid;
		height: 40px;
		width: 40px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 11px;
		background: rgba(5, 212, 113, 0.12);
		color: var(--primary);
	}

	.numbers-card .card-icon {
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
	}

	.boosting-card .card-icon {
		background: rgba(167, 139, 250, 0.12);
		color: #a78bfa;
	}

	.card-title h3 {
		font-family: var(--font-head);
		font-size: 1rem;
		font-weight: 720;
	}

	.card-title p {
		margin-top: 0.15rem;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.item-list {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
	}

	.item-list > a {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.72rem;
		transition:
			background 150ms ease,
			border-color 150ms ease;
	}

	.item-list > a:hover {
		border-color: rgba(5, 212, 113, 0.48);
		background: var(--bg-elev-2);
	}

	.item-list a div {
		min-width: 0;
	}

	.item-identity {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.app-icon {
		display: grid;
		height: 30px;
		width: 30px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 8px;
	}

	.account-app-icon {
		background: rgba(5, 212, 113, 0.1);
		color: var(--primary);
	}

	.boosting-app-icon {
		background: rgba(167, 139, 250, 0.12);
		color: #c4b5fd;
	}

	.item-list strong {
		display: block;
		font-size: 0.86rem;
	}

	.item-list small {
		display: block;
		margin-top: 0.15rem;
		color: var(--primary);
		font-size: 0.72rem;
	}

	.item-list a > span {
		color: var(--text-muted);
		font-size: 0.74rem;
		text-align: right;
	}

	.item-list.compact a > span {
		color: #c4b5fd;
	}

	.empty-note {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.chip-list {
		display: flex;
		align-content: flex-start;
		flex: 1;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 1.2rem;
	}

	.chip-list a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		align-self: flex-start;
		border: 1px solid rgba(56, 189, 248, 0.32);
		border-radius: 999px;
		padding: 0.46rem 0.68rem;
		background: rgba(56, 189, 248, 0.08);
		color: #7dd3fc;
		font-size: 0.76rem;
		font-weight: 650;
		transition:
			background 150ms ease,
			border-color 150ms ease;
	}

	.chip-list a:hover {
		border-color: rgba(56, 189, 248, 0.7);
		background: rgba(56, 189, 248, 0.16);
	}

	.card-cta {
		display: flex;
		margin-top: auto;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding-top: 1rem;
		color: var(--primary);
		font-size: 0.88rem;
		font-weight: 700;
	}

	@media (max-width: 820px) {
		.catalogue-grid {
			grid-template-columns: 1fr;
		}

		.catalogue-card {
			min-height: 0;
		}

		.chip-list {
			margin-bottom: 1.2rem;
		}
	}

	@media (max-width: 480px) {
		.catalogue-section {
			padding-inline: 0.9rem;
		}

		.catalogue-card {
			padding: 1.05rem;
		}

		.item-list > a {
			padding: 0.68rem;
		}
	}
</style>
