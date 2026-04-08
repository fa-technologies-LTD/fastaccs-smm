<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { env as publicEnv } from '$env/dynamic/public';

	import favicon from '$lib/assets/favicon.png';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import PageLoadingBar from '$lib/components/PageLoadingBar.svelte';
	import CookieConsentBar from '$lib/components/CookieConsentBar.svelte';
	import type { LayoutData } from './$types';

	interface Props {
		children: any;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<PageLoadingBar />

<div class="min-h-screen" style="background: linear-gradient(180deg, #07090C 0%, #050607 100%);">
	{@render children?.()}

	<CookieConsentBar />
	<ToastContainer />
</div>
