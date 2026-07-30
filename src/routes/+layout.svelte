<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { env as publicEnv } from '$env/dynamic/public';

	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import PageLoadingBar from '$lib/components/PageLoadingBar.svelte';
	import CookieConsentBar from '$lib/components/CookieConsentBar.svelte';
	import AffiliateAccessNudge from '$lib/components/AffiliateAccessNudge.svelte';
	import SitePopupHost from '$lib/components/SitePopupHost.svelte';
	import PushNotificationPrompt from '$lib/components/PushNotificationPrompt.svelte';
	import { trackSnapPageView, trackSnapConfirmedVisit } from '$lib/services/snap-pixel';
	import { recordAnalyticsEvent } from '$lib/services/analytics-events';
	import { syncGa4Consent, trackGa4PageView } from '$lib/services/ga4';
	import { PRIVACY_CONSENT_CHANGED_EVENT } from '$lib/helpers/privacyConsent';
	import { getSiteBaseUrl } from '$lib/helpers/site-url';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();
	let bannerDismissed = $state(false);
	let lastBannerCookieName = $state<string | null>(null);
	let tawkLoadRequested = false;
	// Seed with the page key src/app.html's inline snippet already tracked
	// (if any), so the post-hydration pass below doesn't double-count it.
	let lastSnapPageKey = typeof window !== 'undefined' ? window.__snapPixelInitialPageKey || '' : '';
	let lastSnapConfirmedKey = '';
	let lastGa4PageKey = '';
	let hydrated = false;
	const announcementBanner = $derived(data.announcementBanner || null);
	const defaultShareTitle = 'Buy Social Media Accounts & Boosting Services | FastAccs';
	const defaultShareDescription =
		'Get Instagram, TikTok, X, Facebook accounts and boosting services with secure checkout, instant delivery, and buyer support.';

	const publicBaseUrl = $derived(getSiteBaseUrl());
	const shareImagePath = '/og-share-1200x630.png?v=20260428a';
	const shareImageUrl = $derived(`${publicBaseUrl}${shareImagePath}`);
	const currentPageUrl = $derived(
		`${publicBaseUrl}${page.url?.pathname || '/'}${page.url?.search || ''}`
	);
	// Pages can override the social-share title/description/type by returning
	// a `seo` object from their load function (see src/routes/blog/+layout.server.ts).
	const seoTitle = $derived(page.data?.seo?.title ?? defaultShareTitle);
	const seoDescription = $derived(page.data?.seo?.description ?? defaultShareDescription);
	const seoType = $derived(page.data?.seo?.type ?? 'website');

	$effect(() => {
		const nextCookieName = announcementBanner?.dismissCookieName || null;
		if (nextCookieName !== lastBannerCookieName) {
			lastBannerCookieName = nextCookieName;
			bannerDismissed = false;
		}
	});

	function loadTawkWidget() {
		const tawkEmbedUrl = publicEnv.PUBLIC_TAWK_EMBED_URL;
		if (!tawkEmbedUrl || typeof window === 'undefined') return;

		const existingScript = document.querySelector<HTMLScriptElement>(
			'script[data-tawk-loader="true"]'
		);
		if (existingScript) return;

		window.Tawk_API = window.Tawk_API || {};
		window.Tawk_LoadStart = new Date();

		const script = document.createElement('script');
		script.async = true;
		script.src = tawkEmbedUrl;
		script.charset = 'UTF-8';
		script.setAttribute('crossorigin', '*');
		script.setAttribute('data-tawk-loader', 'true');

		document.head.appendChild(script);
	}

	function requestTawkWidgetLoad() {
		if (tawkLoadRequested) return;
		tawkLoadRequested = true;
		loadTawkWidget();
	}

	function trackCurrentSnapPageView(force = false): void {
		if (typeof window === 'undefined') return;

		const currentUrl = new URL(window.location.href);
		const pageKey = `${currentUrl.pathname}${currentUrl.search}`;
		if (!force && pageKey === lastSnapPageKey) return;

		if (trackSnapPageView(currentUrl)) {
			lastSnapPageKey = pageKey;
			recordAnalyticsEvent('page_view', pageKey);
		}
	}

	function trackCurrentSnapConfirmedVisit(force = false): void {
		if (typeof window === 'undefined' || !hydrated) return;

		const currentUrl = new URL(window.location.href);
		const pageKey = `${currentUrl.pathname}${currentUrl.search}`;
		if (!force && pageKey === lastSnapConfirmedKey) return;

		if (trackSnapConfirmedVisit(currentUrl)) {
			lastSnapConfirmedKey = pageKey;
			recordAnalyticsEvent('confirmed_visit', pageKey);
		}
	}

	function trackCurrentGa4PageView(force = false): void {
		if (typeof window === 'undefined') return;

		const currentUrl = new URL(window.location.href);
		const pageKey = `${currentUrl.pathname}${currentUrl.search}`;
		if (!force && pageKey === lastGa4PageKey) return;

		if (
			trackGa4PageView(currentUrl, document.title || defaultShareTitle, {
				route_id: page.route.id || 'unknown'
			})
		) {
			lastGa4PageKey = pageKey;
		}
	}

	afterNavigate(() => {
		trackCurrentSnapPageView();
		trackCurrentSnapConfirmedVisit();
		trackCurrentGa4PageView();
	});

	onMount(() => {
		const tawkEmbedUrl = String(publicEnv.PUBLIC_TAWK_EMBED_URL || '').trim();
		if (!tawkEmbedUrl || typeof window === 'undefined') return;

		const intentEvents: Array<keyof WindowEventMap> = [
			'pointerdown',
			'touchstart',
			'keydown',
			'scroll'
		];
		const supportsPassive = { passive: true } as AddEventListenerOptions;
		let fallbackTimer = 0;
		let listenersAttached = false;

		const detachIntentListeners = () => {
			if (!listenersAttached) return;
			intentEvents.forEach((eventName) => {
				window.removeEventListener(eventName, onUserIntent);
			});
			listenersAttached = false;
		};

		const onUserIntent = () => {
			requestTawkWidgetLoad();
			detachIntentListeners();
			window.clearTimeout(fallbackTimer);
		};

		intentEvents.forEach((eventName) => {
			window.addEventListener(eventName, onUserIntent, supportsPassive);
		});
		listenersAttached = true;

		fallbackTimer = window.setTimeout(() => {
			requestTawkWidgetLoad();
			detachIntentListeners();
		}, 8000);

		return () => {
			detachIntentListeners();
			window.clearTimeout(fallbackTimer);
		};
	});

	onMount(() => {
		hydrated = true;
		trackCurrentSnapPageView();
		trackCurrentSnapConfirmedVisit();
		syncGa4Consent();
		trackCurrentGa4PageView();

		const handleConsentChanged = () => {
			syncGa4Consent();
			trackCurrentGa4PageView(true);
		};

		window.addEventListener(PRIVACY_CONSENT_CHANGED_EVENT, handleConsentChanged);

		return () => {
			window.removeEventListener(PRIVACY_CONSENT_CHANGED_EVENT, handleConsentChanged);
		};
	});

	onNavigate((navigation) => {
		// Skip if view transitions not supported
		if (!document.startViewTransition) return;
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;

		// Skip transitions for admin panel (prioritize speed)
		if (from?.startsWith('/admin') || to?.startsWith('/admin')) {
			return;
		}

		// Skip transitions for API routes and auth pages
		if (to?.startsWith('/api') || to?.startsWith('/auth')) {
			return;
		}

		// Only apply smooth transitions for main navigation
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	function dismissAnnouncementBanner(): void {
		if (!announcementBanner || !announcementBanner.dismissible || typeof document === 'undefined')
			return;

		bannerDismissed = true;
		const maxAgeSeconds = 60 * 60 * 24 * 365;
		const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `${announcementBanner.dismissCookieName}=1; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
	}
</script>

<svelte:head>
	<link rel="canonical" href={currentPageUrl} />
	<meta property="og:site_name" content="FastAccs" />
	<meta property="og:type" content={seoType} />
	<meta property="og:title" content={seoTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={currentPageUrl} />
	<meta property="og:image" content={shareImageUrl} />
	<meta property="og:image:secure_url" content={shareImageUrl} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seoTitle} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content={shareImageUrl} />
</svelte:head>

<PageLoadingBar />

<div class="min-h-screen" style="background: linear-gradient(180deg, #07090C 0%, #050607 100%);">
	{#if announcementBanner && !bannerDismissed}
		<div class="announce-bar">
			<div class="announce-inner mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
				<span class="announce-new"><span class="announce-dot"></span>NEW</span>
				<span class="announce-text">{announcementBanner.text}</span>
				<div class="announce-actions">
					{#if announcementBanner.link}
						<a href={announcementBanner.link} class="announce-cta">Learn more →</a>
					{/if}
					{#if announcementBanner.dismissible}
						<button
							type="button"
							class="announce-x"
							onclick={dismissAnnouncementBanner}
							aria-label="Dismiss announcement"
						>
							✕
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{@render children?.()}

	<AffiliateAccessNudge user={data.user} currentPath={data.currentPath} />
	<SitePopupHost isLoggedIn={Boolean(data.user)} />
	<PushNotificationPrompt isLoggedIn={Boolean(data.user)} />
	<CookieConsentBar />
	<ToastContainer />
</div>

<style>
	/* Numbers-launch announcement bar — sky-blue identity, glow + subtle shine. */
	.announce-bar {
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid rgba(56, 189, 248, 0.3);
		background:
			radial-gradient(130% 200% at 0% 50%, rgba(14, 165, 233, 0.32), transparent 58%),
			linear-gradient(90deg, rgba(2, 132, 199, 0.22), rgba(2, 6, 23, 0.9));
		color: #e0f2fe;
	}
	.announce-bar::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 30%,
			rgba(125, 211, 252, 0.16) 50%,
			transparent 70%
		);
		transform: translateX(-100%);
		animation: announce-shine 6s ease-in-out infinite;
		pointer-events: none;
	}
	@keyframes announce-shine {
		0% {
			transform: translateX(-100%);
		}
		55%,
		100% {
			transform: translateX(100%);
		}
	}
	.announce-inner {
		position: relative;
		padding: 0.55rem 1rem;
	}
	.announce-new {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		border-radius: 9999px;
		padding: 0.15rem 0.6rem;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: #082f49;
		background: linear-gradient(180deg, #7dd3fc, #38bdf8);
		box-shadow: 0 0 14px -2px rgba(56, 189, 248, 0.7);
	}
	.announce-dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: #082f49;
		animation: announce-pulse 1.6s ease-in-out infinite;
	}
	@keyframes announce-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	.announce-text {
		flex: 1 1 220px;
		min-width: 0;
		font-size: 0.875rem;
		line-height: 1.35;
	}
	.announce-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		margin-left: auto;
	}
	.announce-cta {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		padding: 0.3rem 0.9rem;
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
		color: #ffffff;
		background: #0ea5e9;
		box-shadow: 0 0 16px -3px rgba(14, 165, 233, 0.85);
		transition:
			transform 140ms ease,
			box-shadow 200ms ease,
			filter 160ms ease;
	}
	.announce-cta:hover {
		transform: translateY(-1px);
		filter: brightness(1.08);
		box-shadow: 0 0 22px -1px rgba(14, 165, 233, 0.95);
	}
	.announce-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 9999px;
		font-size: 0.8rem;
		line-height: 1;
		color: #bae6fd;
		border: 1px solid rgba(125, 211, 252, 0.3);
		background: transparent;
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease;
	}
	.announce-x:hover {
		background: rgba(56, 189, 248, 0.16);
		color: #ffffff;
	}
	@media (prefers-reduced-motion: reduce) {
		.announce-bar::after,
		.announce-dot {
			animation: none;
		}
	}
</style>
