<script lang="ts">
	import { onMount } from 'svelte';
	import { Menu, X, ShoppingCart, BellRing } from '$lib/icons';
	import { cart } from '$lib/stores/cart.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';
	import MiniCart from '$lib/components/MiniCart.svelte';

	let mobileMenuOpen = $state(false);

	// Get auth data from page data (comes from hooks.server.ts)
	const user = $derived(page.data.user);
	interface AffiliateNotificationItem {
		id: string;
		type: string;
		title: string;
		message: string;
		read: boolean;
		createdAt: string;
	}

	let affiliateCanShowBell = $state(false);
	let affiliateUnreadCount = $state(0);
	let affiliateNotifications = $state<AffiliateNotificationItem[]>([]);
	let affiliateInboxOpen = $state(false);
	let affiliateInboxLoading = $state(false);
	let affiliateBellDesktopAnchor = $state<HTMLElement | null>(null);
	let affiliateBellMobileAnchor = $state<HTMLElement | null>(null);

	// Cart item count using the new cart structure
	const cartItemCount = $derived(cart.itemCount);
	const showStorefrontCart = $derived(!page.url.pathname.startsWith('/admin'));

	// Generate initials from user's name
	function getInitials(fullName: string | null | undefined): string {
		if (!fullName) return 'U';

		const names = fullName.trim().split(' ');
		if (names.length >= 2) {
			return (names[0][0] + names[names.length - 1][0]).toUpperCase();
		}
		return names[0][0].toUpperCase();
	}

	// Generate a consistent color based on user's name
	function getAvatarColor(fullName: string | null | undefined): string {
		const colors = [
			'#ef4444', '#3b82f6', '#22c55e', '#eab308',
			'#a855f7', '#ec4899', '#6366f1', '#14b8a6',
			'#f97316', '#10b981', '#06b6d4', '#8b5cf6'
		];
		if (!fullName) return colors[0];
		let hash = 0;
		for (let i = 0; i < fullName.length; i++) {
			hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
		}
		return colors[Math.abs(hash) % colors.length];
	}

	// Capitalize the display name
	const displayName = $derived(
		user?.fullName
			? user.fullName
					.split(' ')
					.map((name: string) => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase())
					.join(' ')
			: 'Account'
	);

	async function signOut() {
		try {
			// Call logout API endpoint
			const response = await fetch('/auth/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				// Invalidate all data and redirect
				await invalidateAll();
				goto('/');
			}
		} catch (error) {
			console.error('Logout error:', error);
			// Fallback: just navigate to home
			goto('/');
		}
	}

	function formatTimeAgo(value: string): string {
		const date = new Date(value);
		const ts = date.getTime();
		if (!Number.isFinite(ts)) return 'just now';

		const diffMs = Math.max(0, Date.now() - ts);
		const minute = 60 * 1000;
		const hour = 60 * minute;
		const day = 24 * hour;

		if (diffMs < minute) return 'just now';
		if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
		if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
		return `${Math.floor(diffMs / day)}d ago`;
	}

	async function loadAffiliateNotifications(limit = 20): Promise<void> {
		if (!user) return;
		affiliateInboxLoading = true;
		try {
			const response = await fetch(`/api/affiliate/notifications?limit=${limit}`);
			const result = await response.json();
			if (!response.ok || !result?.success) {
				return;
			}

			const data = result.data || {};
			affiliateCanShowBell = Boolean(data.canShowBell);
			affiliateUnreadCount = Math.max(0, Number(data.unreadCount || 0));
			affiliateNotifications = Array.isArray(data.notifications)
				? data.notifications.map((raw: unknown) => {
						const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
						return {
							id: String(item.id || ''),
							type: String(item.type || ''),
							title: String(item.title || 'Notification'),
							message: String(item.message || ''),
							read: Boolean(item.read),
							createdAt: String(item.createdAt || new Date().toISOString())
						};
					})
				: [];
		} catch (error) {
			console.error('Failed to load affiliate notifications:', error);
		} finally {
			affiliateInboxLoading = false;
		}
	}

	async function markAffiliateNotificationRead(notificationId: string): Promise<void> {
		if (!notificationId) return;
		try {
			const response = await fetch('/api/affiliate/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ notificationId })
			});
			if (!response.ok) return;
			affiliateNotifications = affiliateNotifications.map((item) =>
				item.id === notificationId ? { ...item, read: true } : item
			);
			affiliateUnreadCount = Math.max(
				0,
				affiliateNotifications.filter((item) => !item.read).length
			);
		} catch (error) {
			console.error('Failed to mark affiliate notification as read:', error);
		}
	}

	async function markAllAffiliateNotificationsRead(): Promise<void> {
		if (affiliateUnreadCount <= 0) return;
		try {
			const response = await fetch('/api/affiliate/notifications/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ markAll: true })
			});
			if (!response.ok) return;
			affiliateNotifications = affiliateNotifications.map((item) => ({ ...item, read: true }));
			affiliateUnreadCount = 0;
		} catch (error) {
			console.error('Failed to mark all affiliate notifications as read:', error);
		}
	}

	function toggleAffiliateInbox(): void {
		affiliateInboxOpen = !affiliateInboxOpen;
		if (affiliateInboxOpen && user) {
			void loadAffiliateNotifications(20);
		}
	}

	onMount(() => {
		if (user) {
			void loadAffiliateNotifications(20);
		}

		const handleOutsideClick = (event: MouseEvent) => {
			if (!affiliateInboxOpen) return;
			const target = event.target as Node | null;
			const isInsideDesktop = Boolean(target && affiliateBellDesktopAnchor?.contains(target));
			const isInsideMobile = Boolean(target && affiliateBellMobileAnchor?.contains(target));
			if (target && !isInsideDesktop && !isInsideMobile) {
				affiliateInboxOpen = false;
			}
		};

		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
	});

	$effect(() => {
		if (!user) {
			affiliateCanShowBell = false;
			affiliateUnreadCount = 0;
			affiliateNotifications = [];
			affiliateInboxOpen = false;
		}
	});
</script>

<nav
	class="sticky top-0 z-50 backdrop-blur-md"
	style="border-bottom: 1px solid var(--border); background: rgba(7, 9, 12, 0.85);"
>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<!-- Logo -->
			<div class="flex items-center">
				<a href="/" class="flex items-center">
					<img src={logo} alt="FastAccs Logo" class="h-7 w-auto sm:h-9" />
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-8 md:flex">
				{#if user}
					<!-- Authenticated User Navigation -->
					<a
						href="/dashboard"
						data-sveltekit-preload-data="hover"
						class="nav-link-active font-medium"
					>
						Dashboard
					</a>
					<a
						href="/platforms"
						data-sveltekit-preload-data="hover"
						class="nav-link-active font-medium"
					>
						Browse Accounts
					</a>
					<a
						href="/services"
						data-sveltekit-preload-data="hover"
						class="nav-link-active font-medium"
					>
						Boosting Services
					</a>
				{:else}
					<!-- Guest Navigation -->
					<a href="/platforms" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						Accounts
					</a>
					<a href="/services" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						Boosting Services
					</a>
					<a href="/how-it-works" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						How It Works
					</a>
					<a href="/blog" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						Blog
					</a>
					<a
						href="https://wa.link/fast_accounts"
						target="_blank"
						rel="noopener noreferrer"
						class="nav-link font-medium"
					>
						Support
					</a>
				{/if}
			</div>

			<!-- Desktop Actions -->
			<div class="hidden items-center space-x-4 md:flex">
				<!-- Storefront cart stays available to admins for user-flow testing. -->
				{#if showStorefrontCart}
					<button
						onclick={() => {
							cart.toggle();
						}}
						class="cart-btn relative p-2"
						aria-label="Open shopping cart"
					>
						<ShoppingCart size={24} />
						{#if cartItemCount > 0}
							<span
								class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
								style="background: var(--primary); color: #04140C; font-family: var(--font-body);"
							>
								{cartItemCount > 99 ? '99+' : cartItemCount}
							</span>
						{/if}
					</button>
				{/if}

				<!-- User Menu -->
				{#if user}
					<div class="relative">
						<div class="flex items-center space-x-4">
							{#if affiliateCanShowBell}
								<div class="relative" bind:this={affiliateBellDesktopAnchor}>
									<button
										type="button"
										onclick={toggleAffiliateInbox}
										class="cart-btn relative p-2"
										aria-label="Affiliate notifications"
										aria-expanded={affiliateInboxOpen}
									>
										<BellRing size={22} />
										{#if affiliateUnreadCount > 0}
											<span class="affiliate-indicator-dot"></span>
										{/if}
									</button>

									{#if affiliateInboxOpen}
										<div
											class="absolute right-0 z-50 mt-2 w-[320px] rounded-[var(--r-sm)] border border-[var(--border)] p-2 shadow-xl"
											style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
										>
											<div class="mb-2 flex items-center justify-between px-2 py-1">
												<div class="text-sm font-semibold" style="color: var(--text);">Updates</div>
												{#if affiliateUnreadCount > 0}
													<button
														type="button"
														onclick={markAllAffiliateNotificationsRead}
														class="text-xs font-semibold"
														style="color: var(--link);"
													>
														Mark all read
													</button>
												{/if}
											</div>
											{#if affiliateInboxLoading}
												<div class="px-2 py-5 text-sm" style="color: var(--text-muted);">
													Loading...
												</div>
											{:else if affiliateNotifications.length === 0}
												<div class="px-2 py-5 text-sm" style="color: var(--text-muted);">
													No updates yet.
												</div>
											{:else}
												<div class="max-h-[320px] space-y-1 overflow-y-auto pr-1">
													{#each affiliateNotifications as note (note.id)}
														<button
															type="button"
															onclick={() => !note.read && markAffiliateNotificationRead(note.id)}
															class="w-full rounded-[10px] border p-2 text-left transition-colors"
															style="border-color: {note.read
																? 'rgba(255,255,255,0.08)'
																: 'rgba(5,212,113,0.36)'}; background: {note.read
																? 'rgba(255,255,255,0.02)'
																: 'rgba(5,212,113,0.08)'};"
														>
															<div class="flex items-start justify-between gap-2">
																<div class="min-w-0">
																	<p
																		class="truncate text-sm font-semibold"
																		style="color: var(--text);"
																	>
																		{note.title}
																	</p>
																	<p
																		class="mt-1 text-xs leading-5"
																		style="color: var(--text-muted);"
																	>
																		{note.message}
																	</p>
																</div>
																{#if !note.read}
																	<span
																		class="mt-1 h-2 w-2 rounded-full"
																		style="background: var(--primary); box-shadow: 0 0 0 4px rgba(5,212,113,0.16);"
																	></span>
																{/if}
															</div>
															<div class="mt-1 text-[11px]" style="color: var(--text-dim);">
																{formatTimeAgo(note.createdAt)}
															</div>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
							<a href="/dashboard" class="nav-link flex items-center space-x-2">
								{#if user.avatarUrl}
									<img src={user.avatarUrl} alt="Profile" class="h-6 w-6 rounded-full" />
								{:else}
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white"
										style="background: {getAvatarColor(user.fullName)};"
									>
										{getInitials(user.fullName)}
									</div>
								{/if}
								<span class="hidden sm:inline">{displayName}</span>
							</a>
							{#if user.userType === 'ADMIN'}
								<a
									href="/admin"
									class="btn-secondary rounded-md px-3 py-1.5 text-sm font-medium active:scale-95"
								>
									Admin
								</a>
							{/if}
							<button
								onclick={signOut}
								class="btn-ghost px-3 py-1.5 text-sm font-medium hover:scale-[.93] focus:ring-2 focus:ring-offset-2 focus:outline-none active:scale-90"
							>
								Sign Out
							</button>
						</div>
					</div>
				{:else}
					<div class="flex items-center space-x-2">
						<a href="/auth/login" class="nav-link font-medium"> Sign In </a>
						<a href="/auth/login" class="btn-primary rounded-full px-4 py-2 font-medium">
							Get Started
						</a>
					</div>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<div class="flex items-center gap-2 md:hidden">
				<!-- Mobile storefront cart -->
				{#if showStorefrontCart}
					<button
						onclick={() => {
							cart.toggle();
						}}
						class="cart-btn relative p-2"
						aria-label="Open shopping cart"
					>
						<ShoppingCart size={24} />
						{#if cartItemCount > 0}
							<span
								class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
								style="background: var(--primary); color: #04140C; font-family: var(--font-body);"
							>
								{cartItemCount > 99 ? '99+' : cartItemCount}
							</span>
						{/if}
					</button>
				{/if}

				{#if user && affiliateCanShowBell}
					<div class="relative" bind:this={affiliateBellMobileAnchor}>
						<button
							type="button"
							onclick={toggleAffiliateInbox}
							class="cart-btn relative p-2"
							aria-label="Affiliate notifications"
						>
							<BellRing size={22} />
							{#if affiliateUnreadCount > 0}
								<span class="affiliate-indicator-dot"></span>
							{/if}
						</button>
						{#if affiliateInboxOpen}
							<div
								class="absolute right-0 z-50 mt-2 w-[88vw] max-w-[340px] rounded-[var(--r-sm)] border border-[var(--border)] p-2 shadow-xl"
								style="background: linear-gradient(180deg, var(--surface-2), var(--surface));"
							>
								<div class="mb-2 flex items-center justify-between px-2 py-1">
									<div class="text-sm font-semibold" style="color: var(--text);">Updates</div>
									{#if affiliateUnreadCount > 0}
										<button
											type="button"
											onclick={markAllAffiliateNotificationsRead}
											class="text-xs font-semibold"
											style="color: var(--link);"
										>
											Mark all read
										</button>
									{/if}
								</div>
								{#if affiliateInboxLoading}
									<div class="px-2 py-5 text-sm" style="color: var(--text-muted);">Loading...</div>
								{:else if affiliateNotifications.length === 0}
									<div class="px-2 py-5 text-sm" style="color: var(--text-muted);">
										No updates yet.
									</div>
								{:else}
									<div class="max-h-[300px] space-y-1 overflow-y-auto pr-1">
										{#each affiliateNotifications as note (note.id)}
											<button
												type="button"
												onclick={() => !note.read && markAffiliateNotificationRead(note.id)}
												class="w-full rounded-[10px] border p-2 text-left transition-colors"
												style="border-color: {note.read
													? 'rgba(255,255,255,0.08)'
													: 'rgba(5,212,113,0.36)'}; background: {note.read
													? 'rgba(255,255,255,0.02)'
													: 'rgba(5,212,113,0.08)'};"
											>
												<div class="flex items-start justify-between gap-2">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold" style="color: var(--text);">
															{note.title}
														</p>
														<p class="mt-1 text-xs leading-5" style="color: var(--text-muted);">
															{note.message}
														</p>
													</div>
													{#if !note.read}
														<span
															class="mt-1 h-2 w-2 rounded-full"
															style="background: var(--primary); box-shadow: 0 0 0 4px rgba(5,212,113,0.16);"
														></span>
													{/if}
												</div>
												<div class="mt-1 text-[11px]" style="color: var(--text-dim);">
													{formatTimeAgo(note.createdAt)}
												</div>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<button
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					class="cart-btn flex items-center justify-center p-2"
					aria-label="Toggle mobile menu"
				>
					{#if mobileMenuOpen}
						<X class="h-6 w-6" />
					{:else}
						<Menu class="h-6 w-6" />
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if mobileMenuOpen}
		<div
			class="md:hidden"
			style="border-top: 1px solid var(--border); background: var(--bg-elev-1);"
		>
			<div class="space-y-4 px-4 py-6">
				<!-- Mobile Navigation Links -->
				<div class="space-y-1">
					{#if user}
						<!-- Authenticated User Mobile Navigation -->
						<a
							href="/dashboard"
							data-sveltekit-preload-data="hover"
							class="nav-link-active block py-3 text-sm font-semibold"
						>
							Dashboard
						</a>
						<a
							href="/platforms"
							data-sveltekit-preload-data="hover"
							class="nav-link-active block py-3 text-sm font-medium"
						>
							Browse Accounts
						</a>
						<a
							href="/services"
							data-sveltekit-preload-data="hover"
							class="nav-link-active block py-3 text-sm font-medium"
						>
							Boosting Services
						</a>
					{:else}
						<!-- Guest Mobile Navigation -->
						<a
							href="/platforms"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							Accounts
						</a>
						<a
							href="/services"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							Boosting Services
						</a>
						<a
							href="/how-it-works"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							How It Works
						</a>
						<a
							href="/blog"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							Blog
						</a>
						<a
							href="https://wa.link/fast_accounts"
							target="_blank"
							rel="noopener noreferrer"
							class="nav-link block py-3 text-sm font-medium"
						>
							Support
						</a>
					{/if}
				</div>

				<!-- Mobile Cart & User -->
				<div class="space-y-2 pt-4" style="border-top: 1px solid var(--border);">
					{#if user}
						<a
							href="/dashboard"
							data-sveltekit-preload-data="hover"
							class="nav-link flex items-center py-3 text-base"
						>
							{#if user.avatarUrl}
								<img src={user.avatarUrl} alt="Profile" class="mr-3 h-5 w-5 rounded-full" />
							{:else}
								<div
									class="mr-3 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium text-white"
									style="background: {getAvatarColor(user.fullName)};"
								>
									{getInitials(user.fullName)}
								</div>
							{/if}
							My Account
						</a>
						{#if user.userType === 'ADMIN'}
							<a
								href="/admin"
								data-sveltekit-preload-data="hover"
								class="btn-secondary mb-2 block rounded-md px-3 py-2 text-base font-medium active:scale-[.98]"
							>
								Admin Dashboard
							</a>
						{/if}
						<button
							onclick={signOut}
							class="btn-ghost block w-full rounded-md px-3 py-2 text-left text-base font-medium shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none active:scale-[.98]"
						>
							Sign Out
						</button>
					{:else}
						<a
							href="/auth/login"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-base font-medium"
						>
							Sign In
						</a>
						<a
							href="/auth/login"
							data-sveltekit-preload-data="hover"
							class="btn-primary block w-full rounded-lg px-4 py-3 text-center text-base font-medium"
						>
							Get Started
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>

<!-- Mini cart is storefront-only, including when an admin is testing buyer flows. -->
{#if showStorefrontCart}
	<MiniCart />
{/if}

<style>
	.nav-link {
		color: var(--text-muted);
		font-family: var(--font-body);
		transition: color 180ms ease;
	}
	.nav-link:hover {
		color: var(--text);
	}
	.nav-link-active {
		color: var(--text);
		font-family: var(--font-body);
		transition: color 180ms ease;
	}
	.nav-link-active:hover {
		color: var(--link);
	}
	.cart-btn {
		color: var(--text-muted);
		transition: color 180ms ease;
	}
	.cart-btn:hover {
		color: var(--text);
	}
	.btn-primary {
		background: var(--btn-primary-gradient);
		border: 1px solid rgba(5, 212, 113, 0.4);
		box-shadow: var(--glow-primary);
		color: #04140c;
		font-family: var(--font-body);
		transition: all 180ms ease;
	}
	.btn-primary:hover {
		background: var(--btn-primary-gradient-hover);
		transform: scale(1.05);
	}
	.btn-primary:active {
		transform: scale(1);
	}
	.btn-secondary {
		background: var(--btn-secondary-gradient);
		border: 1px solid var(--border-2);
		color: var(--text);
		font-family: var(--font-body);
		transition: all 180ms ease;
	}
	.btn-secondary:hover {
		background: var(--btn-secondary-gradient-hover);
	}
	.btn-ghost {
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text);
		font-family: var(--font-body);
		border-radius: var(--r-xs);
		transition: all 180ms ease;
	}
	.btn-ghost:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.affiliate-indicator-dot {
		position: absolute;
		right: 2px;
		top: 2px;
		height: 10px;
		width: 10px;
		border-radius: 999px;
		background: radial-gradient(circle at 30% 30%, #a6ffd2, #05d471 70%);
		box-shadow:
			0 0 0 3px rgba(5, 212, 113, 0.17),
			0 0 12px rgba(5, 212, 113, 0.44);
		animation: bellGlow 1.8s ease-in-out infinite;
	}
	@keyframes bellGlow {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.95;
		}
		50% {
			transform: scale(1.1);
			opacity: 1;
		}
	}
</style>
