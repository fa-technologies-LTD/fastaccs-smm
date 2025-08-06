<script>
	import { Search, ShoppingCart, User, Menu, X } from '@lucide/svelte';

	let mobileMenuOpen = $state(false);
	let cartItemCount = $state(3);
	let isLoggedIn = $state(false);
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
				<a href="/cart" class="relative p-2 text-gray-600 transition-colors hover:text-gray-900">
					<ShoppingCart class="h-6 w-6" />
					{#if cartItemCount > 0}
						<span
							class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white"
						>
							{cartItemCount}
						</span>
					{/if}
				</a>

				<!-- User Menu -->
				{#if isLoggedIn}
					<div class="relative">
						<button
							class="flex items-center space-x-2 text-gray-600 transition-colors hover:text-gray-900"
						>
							<User class="h-6 w-6" />
							<span>Account</span>
						</button>
					</div>
				{:else}
					<div class="flex items-center space-x-2">
						<a
							href="/login"
							class="font-medium text-gray-600 transition-colors hover:text-gray-900"
						>
							Sign In
						</a>
						<a
							href="/register"
							class="rounded-full bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
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
						Cart ({cartItemCount})
					</a>

					{#if isLoggedIn}
						<a href="/dashboard" class="flex items-center py-2 text-gray-600 hover:text-gray-900">
							<User class="mr-2 h-5 w-5" />
							My Account
						</a>
					{:else}
						<a href="/login" class="block py-2 font-medium text-gray-600 hover:text-gray-900">
							Sign In
						</a>
						<a
							href="/register"
							class="block w-full rounded-lg bg-blue-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-blue-700"
						>
							Get Started
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>
