<script lang="ts">
	import { Menu, X, ShoppingCart } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';
	import MiniCart from '$lib/components/MiniCart.svelte';
	import { addToast } from '$lib/stores/toasts';

	let mobileMenuOpen = $state(false);

	// Get auth data from page data (comes from hooks.server.ts)
	const user = $derived(page.data.user);

	// Cart item count using the new cart structure
	const cartItemCount = $derived(cart.itemCount);

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
			'bg-red-500',
			'bg-blue-500',
			'bg-green-500',
			'bg-yellow-500',
			'bg-purple-500',
			'bg-pink-500',
			'bg-indigo-500',
			'bg-teal-500',
			'bg-orange-500',
			'bg-emerald-500',
			'bg-cyan-500',
			'bg-violet-500'
		];

		if (!fullName) return colors[0];

		// Use the name to generate a consistent color index
		let hash = 0;
		for (let i = 0; i < fullName.length; i++) {
			hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
		}
		const index = Math.abs(hash) % colors.length;
		return colors[index];
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
				{:else}
					<!-- Guest Navigation -->
					<a href="/platforms" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						Accounts
					</a>
					<button
						onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
						class="nav-link cursor-pointer border-none bg-transparent font-medium"
					>
						Growth Services
					</button>
					<a href="/how-it-works" data-sveltekit-preload-data="hover" class="nav-link font-medium">
						How It Works
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
				<!-- Cart (hidden for admin users) -->
				{#if !user || user.userType !== 'ADMIN'}
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
							<a href="/dashboard" class="nav-link flex items-center space-x-2">
								{#if user.avatarUrl}
									<img src={user.avatarUrl} alt="Profile" class="h-6 w-6 rounded-full" />
								{:else}
									<div
										class="flex h-6 w-6 items-center justify-center rounded-full {getAvatarColor(
											user.fullName
										)} text-xs font-medium text-white"
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
				<!-- Mobile Cart (hidden for admin users) -->
				{#if !user || user.userType !== 'ADMIN'}
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
					{:else}
						<!-- Guest Mobile Navigation -->
						<a
							href="/platforms"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							Accounts
						</a>
						<button
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							class="nav-link block w-full cursor-pointer border-none bg-transparent py-3 text-left text-sm font-medium"
						>
							Growth Services
						</button>
						<a
							href="/how-it-works"
							data-sveltekit-preload-data="hover"
							class="nav-link block py-3 text-sm font-medium"
						>
							How It Works
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
									class="mr-3 flex h-5 w-5 items-center justify-center rounded-full {getAvatarColor(
										user.fullName
									)} text-xs font-medium text-white"
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

<!-- Mini Cart Component (hidden for admin users) -->
{#if !user || user.userType !== 'ADMIN'}
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
</style>
