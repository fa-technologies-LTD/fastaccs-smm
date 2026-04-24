<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { env as publicEnv } from '$env/dynamic/public';

	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import PageLoadingBar from '$lib/components/PageLoadingBar.svelte';
	import CookieConsentBar from '$lib/components/CookieConsentBar.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();
	let bannerDismissed = $state(false);
	let lastBannerCookieName = $state<string | null>(null);
	const announcementBanner = $derived(data.announcementBanner || null);

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

	onMount(() => {
		loadTawkWidget();
	});

	onNavigate((navigation) => {
		// Skip if view transitions not supported
		if (!document.startViewTransition) return;

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
		if (!announcementBanner || !announcementBanner.dismissible || typeof document === 'undefined') return;

		bannerDismissed = true;
		const maxAgeSeconds = 60 * 60 * 24 * 365;
		const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `${announcementBanner.dismissCookieName}=1; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
	}
</script>

<PageLoadingBar />

<div class="min-h-screen" style="background: linear-gradient(180deg, #07090C 0%, #050607 100%);">
	{#if announcementBanner && !bannerDismissed}
		<div
			class="border-b px-4 py-2 text-sm"
			style="border-color: rgba(59, 130, 246, 0.35); background: linear-gradient(90deg, rgba(30, 64, 175, 0.28) 0%, rgba(15, 23, 42, 0.8) 100%); color: #dbeafe;"
		>
			<div class="mx-auto flex max-w-6xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<span class="font-semibold tracking-wide uppercase" style="color: #93c5fd;">Announcement</span>
					<span class="ml-2 break-words">{announcementBanner.text}</span>
					{#if announcementBanner.link}
						<a
							href={announcementBanner.link}
							class="ml-3 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-90"
							style="background: rgba(59, 130, 246, 0.28); color: #bfdbfe; border: 1px solid rgba(147, 197, 253, 0.3);"
						>
							Learn more
						</a>
					{/if}
				</div>
				{#if announcementBanner.dismissible}
					<button
						type="button"
						class="rounded-full px-2 py-0.5 text-xs font-semibold transition-opacity hover:opacity-90"
						style="border: 1px solid rgba(147, 197, 253, 0.4); color: #dbeafe;"
						onclick={dismissAnnouncementBanner}
						aria-label="Dismiss announcement"
					>
						Dismiss
					</button>
				{/if}
			</div>
		</div>
	{/if}

	{@render children?.()}

	<CookieConsentBar />
	<ToastContainer />
</div>
