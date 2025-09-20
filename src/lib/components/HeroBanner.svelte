<script>
	import { goto } from '$app/navigation';
</script>

<section class="bg-gradient-primary px-4 py-12 text-white sm:py-16 lg:py-20">
	<div class="mx-auto max-w-6xl text-center">
		<!-- Main Hero Content -->
		<div class="mb-6 sm:mb-8">
			<h1 class="mb-4 text-2xl leading-tight font-bold sm:text-3xl md:text-4xl">
				Get Premium Social Media Accounts
				<span class="text-primary-accent-bright">Instantly</span>
			</h1>
			<p
				class="mx-auto mb-6 max-w-3xl text-base text-green-100 sm:mb-8 sm:text-lg md:text-xl lg:text-2xl"
			>
				Nigeria's most trusted marketplace for verified social media accounts and boosting services.
				Fast, secure, and reliable delivery guaranteed.
			</p>
		</div>

		<!-- CTA Buttons -->
		<div class="mb-8 flex flex-col items-center justify-center gap-3 sm:mb-12 sm:flex-row sm:gap-4">
			<button
				class="cursor-pointer bg-primary-accent hover:bg-primary-accent-bright w-full transform rounded-full px-6 py-2 text-base font-semibold text-gray-900 shadow-lg transition-all hover:scale-105 active:scale-100 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
				onclick={() => goto('/accounts')}
			>
				Browse Accounts
			</button>
			<button
				class="cursor-pointer hover:text-neutral-dark w-full rounded-full border-2 border-white px-6 py-2 text-base font-semibold text-white transition-all hover:bg-white hover:text-black active:bg-white sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
				onclick={() => goto('/services')}
			>
				View Boosting Services
			</button>
		</div>

		<!-- Trust Indicators -->
		<div class="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 text-3xl font-bold text-yellow-300">Premium</div>
				<div class="text-blue-100">Quality Accounts</div>
			</div>
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 text-3xl font-bold text-yellow-300">24/7</div>
				<div class="text-blue-100">Instant Delivery</div>
			</div>
			<div class="rounded-lg bg-white/10 p-6 backdrop-blur-sm">
				<div class="mb-2 text-3xl font-bold text-yellow-300">Secure</div>
				<div class="text-blue-100">Safe Transactions</div>
			</div>
		</div>
	</div>
</section>
