<script>
	import {
		Star,
		MessageCircle,
		CheckCircle,
		Clock,
		Shield,
		Zap,
		HeartHandshake,
		Phone
	} from '@lucide/svelte';
</script>

<section class="bg-white px-4 py-16">
	<div class="mx-auto max-w-6xl">
		<h2 class="mb-4 text-center text-xl font-bold text-gray-800 md:text-4xl">
			Why Choose FastAccs?
		</h2>
		<p class="mb-12 text-center text-base text-gray-600">
			Your trusted partner for premium social media accounts and growth services
		</p>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
			<!-- Secure Payments -->
			<div class="text-center">
				<div class="mb-4 flex justify-center">
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
						<Shield class="h-8 w-8 text-green-600" />
					</div>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-gray-800">100% Secure</h3>
				<p class="text-gray-600">All transactions are encrypted and protected</p>
			</div>

			<!-- Instant Delivery -->
			<div class="text-center">
				<div class="mb-4 flex justify-center">
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
						<Zap class="h-8 w-8 text-blue-600" />
					</div>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-gray-800">Instant Delivery</h3>
				<p class="text-gray-600">Get your accounts delivered within minutes</p>
			</div>

			<!-- Quality Guarantee -->
			<div class="text-center">
				<div class="mb-4 flex justify-center">
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
						<HeartHandshake class="h-8 w-8 text-purple-600" />
					</div>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-gray-800">Quality Guaranteed</h3>
				<p class="text-gray-600">Premium verified accounts with authentic activity</p>
			</div>

			<!-- 24/7 Support -->
			<div class="text-center">
				<div class="mb-4 flex justify-center">
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
						<Phone class="h-8 w-8 text-orange-600" />
					</div>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-gray-800">24/7 Support</h3>
				<p class="text-gray-600">Round-the-clock customer support when you need it</p>
			</div>
		</div>

		<!-- Trust Badges -->
		<div class="mt-12 text-center">
			<div class="flex flex-wrap items-center justify-center gap-8 opacity-60">
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">SSL Encrypted</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">Verified Accounts</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">Money Back Guarantee</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">Premium Quality</span>
				</div>
			</div>
		</div>
	</div>
</section>
