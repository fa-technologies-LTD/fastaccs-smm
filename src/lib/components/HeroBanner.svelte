<script>
	import { Search, ShoppingCart, Star } from '@lucide/svelte';

	let searchQuery = $state('');
</script>

<section class="bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 px-4 py-16 text-white">
	<div class="mx-auto max-w-6xl text-center">
		<!-- Main Hero Content -->
		<div class="mb-8">
			<h1 class="mb-4 text-4xl leading-tight font-bold md:text-6xl">
				Get Premium Social Media Accounts
				<span class="text-yellow-300">Instantly</span>
			</h1>
			<p class="mx-auto mb-8 max-w-3xl text-xl text-blue-100 md:text-2xl">
				Nigeria's most trusted marketplace for verified social media accounts and boosting services.
				Fast, secure, and reliable delivery guaranteed.
			</p>
		</div>

		<!-- Search Bar -->
		<div class="mx-auto mb-8 max-w-2xl">
			<div class="relative">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search for Instagram, TikTok, Facebook accounts..."
					class="w-full rounded-full bg-white px-6 py-4 text-lg text-gray-900 shadow-lg transition-all focus:ring-4 focus:ring-yellow-300 focus:outline-none"
				/>
				<button
					class="absolute top-2 right-2 rounded-full bg-yellow-400 p-2 text-gray-900 transition-colors hover:bg-yellow-500"
				>
					<Search size={24} />
				</button>
			</div>
		</div>

		<!-- CTA Buttons -->
		<div class="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
			<button
				class="transform rounded-full bg-yellow-400 px-8 py-4 text-lg font-semibold text-gray-900 shadow-lg transition-all hover:scale-105 hover:bg-yellow-500"
			>
				Browse Accounts
			</button>
			<button
				class="rounded-full border-2 border-white px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-white hover:text-purple-600"
			>
				View Boosting Services
			</button>
		</div>

		<!-- Trust Indicators -->
		<div class="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 text-3xl font-bold text-yellow-300">10,000+</div>
				<div class="text-blue-100">Accounts Delivered</div>
			</div>
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 text-3xl font-bold text-yellow-300">24/7</div>
				<div class="text-blue-100">Instant Delivery</div>
			</div>
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 flex items-center justify-center">
					{#each Array(5) as _}
						<Star class="h-6 w-6 fill-yellow-300 text-yellow-300" />
					{/each}
				</div>
				<div class="text-blue-100">5-Star Rated</div>
			</div>
		</div>
	</div>
</section>
