<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { env as publicEnv } from '$env/dynamic/public';

	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import PageLoadingBar from '$lib/components/PageLoadingBar.svelte';
	import CookieConsentBar from '$lib/components/CookieConsentBar.svelte';
	import SitePopupHost from '$lib/components/SitePopupHost.svelte';
	import PushNotificationPrompt from '$lib/components/PushNotificationPrompt.svelte';
	import {
		trackSnapPageView,
		trackSnapConfirmedVisit,
		trackPendingSnapSignup
	} from '$lib/services/snap-pixel';
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
	let tawkLoadRequested = false;
	// Seed with the page key src/app.html's inline snippet already tracked
	// (if any), so the post-hydration pass below doesn't double-count it.
	let lastSnapPageKey = typeof window !== 'undefined' ? window.__snapPixelInitialPageKey || '' : '';
	let lastSnapConfirmedKey = '';
	let lastGa4PageKey = '';
	let hydrated = false;
	const defaultShareTitle = 'Buy Social Media Accounts & Boosting Services | FastAccs';
	const defaultShareDescription =
		'Get Instagram, TikTok, X, Facebook accounts and boosting services with secure checkout, clear order tracking, and buyer support.';

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
		trackPendingSnapSignup();
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
	{@render children?.()}

	<SitePopupHost isLoggedIn={Boolean(data.user)} />
	<PushNotificationPrompt isLoggedIn={Boolean(data.user)} />
	<CookieConsentBar />
	<ToastContainer />
</div>
