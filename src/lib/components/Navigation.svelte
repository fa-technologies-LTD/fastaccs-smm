<script>
	import { Search, User, Menu, X, ShoppingCart, LogOut, Settings } from '@lucide/svelte';
	import { cart, cartState, itemCount } from '$lib/stores/cart.svelte';
	import { auth } from '$lib/stores/auth';
	import MiniCart from './MiniCart.svelte';

	let mobileMenuOpen = $state(false);
	let userMenuOpen = $state(false);

	// Create local derived values from the functions
	const currentItemCount = $derived(itemCount());

	// Initialize auth using $effect
	$effect(() => {
		// Initialize auth if not done yet
		if (!$auth.initialized) {
			auth.initialize();
		}
	});

	async function handleSignOut() {
		try {
			await auth.signOut();
			userMenuOpen = false;
		} catch (error) {
			console.error('Sign out error:', error);
		}
	}

	function closeMenus() {
		mobileMenuOpen = false;
		userMenuOpen = false;
	}
</script>

<nav class="sticky top-0 z-50 border-b border-gray-200 bg-white">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center justify-between">
			<!-- Logo -->
			<div class="flex items-center">
				<a href="/" class="flex items-center">
					<div
						class="mr-2 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-bold text-white"
					>
						FA
					</div>
					<span class="text-xl font-bold text-gray-900">FastAccs</span>
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden items-center space-x-8 md:flex">
				<a href="/accounts" class="font-medium text-gray-600 transition-colors hover:text-gray-900">
					Accounts
				</a>
				<a href="/services" class="font-medium text-gray-600 transition-colors hover:text-gray-900">
					Boosting Services
				</a>
				<a
					href="/how-it-works"
					class="font-medium text-gray-600 transition-colors hover:text-gray-900"
				>
					How It Works
				</a>
				<a href="/support" class="font-medium text-gray-600 transition-colors hover:text-gray-900">
					Support
				</a>
			</div>

			<!-- Desktop Actions -->
			<div class="hidden items-center space-x-4 md:flex">
				<!-- Search -->
				<div class="relative">
					<input
						type="text"
						placeholder="Search accounts..."
						class="w-64 rounded-full border border-gray-300 py-2 pr-4 pl-10 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
					<Search class="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
				</div>

				<!-- Cart -->
				<MiniCart />

				<!-- User Menu -->
				{#if $auth.user}
					<div class="relative">
						<button
							onclick={() => (userMenuOpen = !userMenuOpen)}
							class="flex items-center space-x-2 rounded-lg p-2 text-gray-600 transition-colors hover:text-gray-900 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none"
						>
							{#if $auth.profile?.avatar_url}
								<img src={$auth.profile.avatar_url} alt="Profile" class="h-6 w-6 rounded-full" />
							{:else}
								<User class="h-6 w-6" />
							{/if}
							<span class="hidden sm:inline">{$auth.profile?.full_name || $auth.user.email}</span>
						</button>

						{#if userMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="fixed inset-0 z-10"
								onclick={closeMenus}
								role="button"
								tabindex="-1"
							></div>
							<div
								class="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
							>
								<a
									href="/dashboard"
									onclick={closeMenus}
									class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
								>
									<User class="mr-3 h-4 w-4" />
									Dashboard
								</a>
								<a
									href="/dashboard/settings"
									onclick={closeMenus}
									class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
								>
									<Settings class="mr-3 h-4 w-4" />
									Settings
								</a>
								<hr class="my-1" />
								<button
									onclick={handleSignOut}
									class="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
								>
									<LogOut class="mr-3 h-4 w-4" />
									Sign Out
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<div class="flex items-center space-x-2">
						<a
							href="/auth/login"
							class="rounded-full bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700"
						>
							Get Started
						</a>
					</div>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<button
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="p-2 text-gray-600 transition-colors hover:text-gray-900 md:hidden"
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
			<div class="space-y-4 px-4 py-4">
				<!-- Mobile Search -->
				<div class="relative">
					<input
						type="text"
						placeholder="Search accounts..."
						class="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
					<Search class="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
				</div>

				<!-- Mobile Navigation Links -->
				<div class="space-y-2">
					<a href="/accounts" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
						Accounts
					</a>
					<a href="/services" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
						Boosting Services
					</a>
					<a href="/how-it-works" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
						How It Works
					</a>
					<a href="/support" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
						Support
					</a>
				</div>

				<!-- Mobile Cart & User -->
				<div class="space-y-2 border-t border-gray-200 pt-4">
					<a href="/cart" class="flex items-center py-2 text-gray-600 hover:text-gray-900">
						<ShoppingCart class="mr-2 h-5 w-5" />
						Cart ({currentItemCount})
					</a>

					{#if $auth.user}
						<a href="/dashboard" class="flex items-center py-2 text-gray-600 hover:text-gray-900">
							<User class="mr-2 h-5 w-5" />
							My Account
						</a>
						<button
							onclick={handleSignOut}
							class="flex w-full items-start py-2 text-gray-600 hover:text-gray-900"
						>
							<LogOut class="mr-2 h-5 w-5" />
							Sign Out
						</button>
					{:else}
						<a href="/auth/login" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
							Sign In
						</a>
						<a
							href="/auth/login"
							class="block w-full rounded-lg bg-purple-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-purple-700"
						>
							Get Started
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>
