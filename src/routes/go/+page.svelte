<script lang="ts">
	import { trackSnapEvent } from '$lib/services/snap-pixel';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import logo from '$lib/assets/logo.png';
	import { TrendingUp, Users, Phone, LifeBuoy, ArrowRight } from '$lib/icons';

	interface HubLink {
		id: string;
		title: string;
		description: string;
		href: string;
		icon: typeof TrendingUp;
	}

	const links: HubLink[] = [
		{
			id: 'boosting-services',
			title: 'Boosting Services',
			description: 'Followers, likes and views across multiple platforms.',
			href: 'https://smm.fastaccs.com/services',
			icon: TrendingUp
		},
		{
			id: 'browse-accounts',
			title: 'Browse Accounts',
			description: 'Ready-to-use SM accounts for different platforms.',
			href: 'https://smm.fastaccs.com/platforms',
			icon: Users
		},
		{
			id: 'verification-numbers',
			title: 'Verification Numbers',
			description: 'Verification numbers for supported platforms and services.',
			href: 'https://smm.fastaccs.com/numbers',
			icon: Phone
		},
		{
			id: 'support',
			title: 'Support',
			description: 'Help with orders and services.',
			href: 'https://smm.fastaccs.com/support',
			icon: LifeBuoy
		}
	];

	// A short delay before navigating gives the Snap pixel network call (and the
	// keepalive analytics fetch) a chance to leave the page before the browser
	// unloads it. Modifier/middle clicks (new tab) are left alone so they behave
	// normally.
	function handleClick(event: MouseEvent, link: HubLink) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

		event.preventDefault();
		trackSnapEvent('VIEW_CONTENT', { content_name: link.id, content_category: 'hub_click' });
		recordAnalyticsEvent('view_content', `/go/${link.id}`);

		window.setTimeout(() => {
			window.location.href = link.href;
		}, 120);
	}
</script>

<svelte:head>
	<title>Fast Accounts — All Socials. One Plug.</title>
	<meta
		name="description"
		content="Social growth, SM accounts, verification numbers and support in one place."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="hub">
	<div class="hub-glow" aria-hidden="true"></div>

	<div class="hub-inner">
		<img src={logo} alt="Fast Accounts" class="hub-logo" />

		<h1 class="hub-tagline">All Socials. One Plug.</h1>
		<p class="hub-sub">
			Social growth, SM accounts, verification numbers and support in one place.
		</p>

		<nav class="hub-links" aria-label="Fast Accounts destinations">
			{#each links as link (link.id)}
				<a
					href={link.href}
					class="hub-btn hub-btn--{link.id}"
					onclick={(event) => handleClick(event, link)}
				>
					<span class="hub-btn-icon"><link.icon size={22} /></span>
					<span class="hub-btn-text">
						<span class="hub-btn-title">{link.title}</span>
						<span class="hub-btn-desc">{link.description}</span>
					</span>
					<span class="hub-btn-arrow"><ArrowRight size={18} /></span>
				</a>
			{/each}
		</nav>

		<p class="hub-trust">Fast delivery. Simple ordering. Multiple platforms.</p>
	</div>

	<footer class="hub-footer">
		<img src="/apple-touch-icon.png" alt="" aria-hidden="true" class="hub-footer-mark" />
		<span>Fast Accounts</span>
		<span class="hub-footer-dot">&middot;</span>
		<span>&copy; {new Date().getFullYear()}</span>
	</footer>
</main>

<style>
	.hub {
		position: relative;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 48px 20px 28px;
		overflow: hidden;
		background: linear-gradient(180deg, #07090c 0%, #050607 55%, #051a10 100%);
	}

	.hub-glow {
		position: absolute;
		top: -140px;
		left: 50%;
		transform: translateX(-50%);
		width: 560px;
		height: 560px;
		max-width: 140vw;
		background: radial-gradient(circle, rgba(5, 212, 113, 0.22) 0%, rgba(5, 212, 113, 0) 70%);
		filter: blur(10px);
		pointer-events: none;
		animation: hub-glow-pulse 8s ease-in-out infinite;
	}

	@keyframes hub-glow-pulse {
		0%,
		100% {
			opacity: 0.7;
			transform: translateX(-50%) scale(1);
		}
		50% {
			opacity: 1;
			transform: translateX(-50%) scale(1.08);
		}
	}

	.hub-inner {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.hub-logo {
		height: 38px;
		width: auto;
		margin-bottom: 28px;
	}

	.hub-tagline {
		font-family: var(--font-head);
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text);
		margin: 0 0 10px;
	}

	.hub-sub {
		font-family: var(--font-body);
		font-size: 0.95rem;
		color: var(--text-muted);
		max-width: 340px;
		margin: 0 0 32px;
		line-height: 1.55;
	}

	.hub-links {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.hub-btn {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 16px 18px;
		border-radius: var(--r-lg);
		border: 1px solid var(--border);
		background: var(--surface);
		text-decoration: none;
		text-align: left;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease,
			background 0.15s ease;
	}

	.hub-btn:active {
		transform: scale(0.985);
	}

	.hub-btn:hover,
	.hub-btn:focus-visible {
		border-color: var(--border-2);
		background: var(--surface-2);
	}

	.hub-btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r-md);
		flex-shrink: 0;
		background: var(--surface-2);
		color: var(--text);
	}

	.hub-btn-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.hub-btn-title {
		font-family: var(--font-head);
		font-weight: 700;
		font-size: 0.96rem;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		color: var(--text);
	}

	.hub-btn-desc {
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.35;
	}

	.hub-btn-arrow {
		display: flex;
		align-items: center;
		color: var(--text-dim);
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.hub-btn:hover .hub-btn-arrow,
	.hub-btn:focus-visible .hub-btn-arrow {
		transform: translateX(3px);
	}

	/* All four destinations share one card style — order alone signals priority.
	   Only the icon accent color varies, per destination. */
	.hub-btn--boosting-services .hub-btn-icon {
		color: var(--primary);
	}

	.hub-btn--browse-accounts .hub-btn-icon {
		color: var(--fa-lime-700);
	}

	.hub-btn--verification-numbers .hub-btn-icon {
		color: #38bdf8;
	}

	.hub-btn--support .hub-btn-icon {
		color: var(--link);
	}

	.hub-trust {
		margin-top: 28px;
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--text-dim);
		letter-spacing: 0.01em;
	}

	.hub-footer {
		position: relative;
		z-index: 1;
		margin-top: auto;
		padding-top: 40px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-body);
		font-size: 0.76rem;
		color: var(--text-dim);
	}

	.hub-footer-mark {
		width: 18px;
		height: 18px;
		opacity: 0.85;
	}

	.hub-footer-dot {
		opacity: 0.5;
	}

	@media (max-width: 380px) {
		.hub-tagline {
			font-size: 1.4rem;
		}

		.hub-btn-title {
			font-size: 0.9rem;
		}
	}
</style>
