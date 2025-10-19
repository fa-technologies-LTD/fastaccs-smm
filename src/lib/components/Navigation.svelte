<script lang="ts">
	import { User, Menu, X, ShoppingCart } from '@lucide/svelte';
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

<nav class="sticky top-0 z-50 border-b border-gray-200 bg-white">
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
				<a
					href="/platforms"
					class="font-medium text-gray-600 transition-colors hover:text-gray-900"
				>
					Accounts
				</a>
				<button
					onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
					class="cursor-pointer border-none bg-transparent font-medium text-gray-600 transition-colors hover:text-gray-900"
				>
					Boosting Services
				</button>
				<a
					href="/how-it-works"
					class="font-medium text-gray-600 transition-colors hover:text-gray-900"
				>
					How It Works
				</a>
			</div>

			<!-- Desktop Actions -->
			<div class="hidden items-center space-x-4 md:flex">
				<!-- Cart (hidden for admin users) -->
				{#if !user || user.userType !== 'ADMIN'}
					<button
						onclick={() => {
							console.log('Cart button clicked, isOpen:', cart.isOpen);
							cart.toggle();
							console.log('After toggle, isOpen:', cart.isOpen);
						}}
						class="relative p-2 text-gray-600 transition-colors hover:text-gray-900"
						aria-label="Open shopping cart"
					>
						<ShoppingCart size={24} />
						{#if cartItemCount > 0}
							<span
								class="bg-primary absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
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
							<a
								href="/dashboard"
								class="flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900"
							>
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
									class="rounded-md bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800"
								>
									Admin
								</a>
							{/if}
							<button
								onclick={signOut}
								class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:scale-[.93] hover:bg-gray-50 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
							>
								Sign Out
							</button>
						</div>
					</div>
				{:else}
					<div class="flex items-center space-x-2">
						<a
							href="/auth/login"
							class="font-medium text-gray-600 transition-colors hover:text-gray-900"
						>
							Sign In
						</a>
						<a
							href="/auth/login"
							class="bg-primary hover:bg-primary-dark rounded-full px-4 py-2 font-medium text-white transition-colors"
						>
							Get Started
						</a>
					</div>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<button
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="flex items-center justify-center p-2 text-gray-600 transition-colors hover:text-gray-900 md:hidden"
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

	<!-- Mobile menu -->
	{#if mobileMenuOpen}
		<div class="border-t border-gray-200 bg-white md:hidden">
			<div class="space-y-4 px-4 py-6">
				<!-- Mobile Navigation Links -->
				<div class="space-y-1">
					<a
						href="/platforms"
						class="block py-3 text-sm font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						Accounts
					</a>
					<button
						onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
						class="block w-full cursor-pointer border-none bg-transparent py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						Boosting Services
					</button>
					<a
						href="/how-it-works"
						class="block py-3 text-sm font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						How It Works
					</a>
				</div>

				<!-- Mobile Cart & User -->
				<div class="space-y-2 border-t border-gray-200 pt-4">
					<!-- Cart (hidden for admin users) -->
					{#if !user || user.userType !== 'ADMIN'}
						<a
							href="/cart"
							class="flex items-center py-3 text-base text-gray-600 hover:text-gray-900 active:bg-gray-50"
						>
							<ShoppingCart class="mr-3 h-5 w-5" />
							Cart ({cartItemCount})
						</a>
					{/if}

					{#if user}
						<a
							href="/dashboard"
							class="flex items-center py-3 text-base text-gray-600 hover:text-gray-900 active:bg-gray-50"
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
								class="mb-2 block rounded-md bg-blue-50 px-3 py-2 text-base font-medium text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800"
							>
								Admin Dashboard
							</a>
						{/if}
						<button
							onclick={signOut}
							class="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-base font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						>
							Sign Out
						</button>
					{:else}
						<a
							href="/auth/login"
							class="block py-3 text-base font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
						>
							Sign In
						</a>
						<a
							href="/auth/login"
							class="bg-primary hover:bg-primary-dark active:bg-primary-dark block w-full rounded-lg px-4 py-3 text-center text-base font-medium text-white transition-colors"
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
