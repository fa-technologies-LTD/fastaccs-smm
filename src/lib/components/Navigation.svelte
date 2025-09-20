<script>
	import { User, Menu, X, ShoppingCart } from '@lucide/svelte';
	import { cart } from '$lib/stores/cart';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';

	let mobileMenuOpen = $state(false);

	let cartState = $state($cart);
	const cartItemCount = $derived(cartState.items.reduce((total, item) => total + item.quantity, 0));

	// Get auth data from page data
	const user = $derived(page.data.user);
	const supabase = $derived(page.data.supabase);

	// Keep cart state in sync
	$effect(() => {
		cartState = $cart;
	});

	async function signOut() {
		await supabase.auth.signOut();
		await invalidateAll();
		goto('/');
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
			</div>

			<!-- Desktop Actions -->
			<div class="hidden items-center space-x-4 md:flex">
				<!-- Cart -->
				<button
					onclick={() => cart.toggle()}
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

				<!-- User Menu -->
				{#if user}
					<div class="relative">
						<div class="flex items-center space-x-2">
							<a
								href="/dashboard"
								class="flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900"
							>
								{#if user.user_metadata?.avatar_url}
									<img
										src={user.user_metadata.avatar_url}
										alt="Profile"
										class="h-6 w-6 rounded-full"
									/>
								{:else}
									<User class="h-6 w-6" />
								{/if}
								<span class="hidden sm:inline">{user.user_metadata?.full_name || 'Account'}</span>
							</a>
							<button
								onclick={signOut}
								class="text-sm text-gray-500 transition-colors hover:text-gray-700"
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
						href="/accounts"
						class="block py-3 text-base font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						Accounts
					</a>
					<a
						href="/services"
						class="block py-3 text-base font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						Boosting Services
					</a>
					<a
						href="/how-it-works"
						class="block py-3 text-base font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						How It Works
					</a>
				</div>

				<!-- Mobile Cart & User -->
				<div class="space-y-2 border-t border-gray-200 pt-4">
					<a
						href="/cart"
						class="flex items-center py-3 text-base text-gray-600 hover:text-gray-900 active:bg-gray-50"
					>
						<ShoppingCart class="mr-3 h-5 w-5" />
						Cart ({cartItemCount})
					</a>

					{#if user}
						<a
							href="/dashboard"
							class="flex items-center py-3 text-base text-gray-600 hover:text-gray-900 active:bg-gray-50"
						>
							{#if user.user_metadata?.avatar_url}
								<img
									src={user.user_metadata.avatar_url}
									alt="Profile"
									class="mr-3 h-5 w-5 rounded-full"
								/>
							{:else}
								<User class="mr-3 h-5 w-5" />
							{/if}
							My Account
						</a>
						<button
							onclick={signOut}
							class="block w-full py-3 text-left text-base font-medium text-gray-600 hover:text-gray-900 active:bg-gray-50"
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
