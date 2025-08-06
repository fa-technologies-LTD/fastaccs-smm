<script>
	import { Star, MessageCircle, CheckCircle, Clock } from '@lucide/svelte';

	let testimonials = [
		{
			name: 'Sarah Johnson',
			account: '@sarahbeauty',
			platform: 'Instagram',
			rating: 5,
			text: 'Got my 50K Instagram account in less than 5 minutes! Amazing quality and the followers are real. Will definitely order again.',
			time: '2 hours ago'
		},
		{
			name: 'David Adebayo',
			account: '@davidtech',
			platform: 'TikTok',
			rating: 5,
			text: 'Perfect TikTok account with 100K followers. The engagement rate is excellent and delivery was instant. Highly recommend!',
			time: '1 day ago'
		},
		{
			name: 'Grace Okafor',
			account: '@gracestyles',
			platform: 'Instagram',
			rating: 5,
			text: 'Best SMM service in Nigeria! Clean interface, fast delivery, and great customer support. My business is growing fast now.',
			time: '3 days ago'
		}
	];

	let recentSales = [
		{
			platform: 'Instagram',
			followers: '25K',
			buyer: 'John D.',
			time: '2 mins ago',
			price: '₦15,000'
		},
		{
			platform: 'TikTok',
			followers: '80K',
			buyer: 'Mary A.',
			time: '5 mins ago',
			price: '₦35,000'
		},
		{
			platform: 'Facebook',
			followers: '12K',
			buyer: 'Peter O.',
			time: '8 mins ago',
			price: '₦8,500'
		},
		{
			platform: 'Instagram',
			followers: '45K',
			buyer: 'Kate E.',
			time: '12 mins ago',
			price: '₦22,000'
		},
		{
			platform: 'YouTube',
			followers: '5K',
			buyer: 'Mike T.',
			time: '15 mins ago',
			price: '₦12,000'
		}
	];
</script>

<section class="bg-white px-4 py-16">
	<div class="mx-auto max-w-6xl">
		<h2 class="mb-4 text-center text-3xl font-bold text-gray-800 md:text-4xl">
			Trusted by Thousands
		</h2>
		<p class="mb-12 text-center text-xl text-gray-600">
			See what our customers are saying and watch accounts being sold in real-time
		</p>

		<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
			<!-- Testimonials Section -->
			<div>
				<h3 class="mb-6 flex items-center text-2xl font-bold text-gray-800">
					<MessageCircle class="mr-2 h-6 w-6 text-blue-600" />
					Customer Reviews
				</h3>

				<div class="space-y-6">
					{#each testimonials as testimonial}
						<div class="rounded-lg bg-gray-50 p-6 transition-shadow hover:shadow-md">
							<div class="mb-3 flex items-start justify-between">
								<div>
									<div class="font-semibold text-gray-800">{testimonial.name}</div>
									<div class="text-sm text-gray-600">
										{testimonial.account} • {testimonial.platform}
									</div>
								</div>
								<div class="flex items-center">
									{#each Array(testimonial.rating) as _}
										<Star class="h-4 w-4 fill-yellow-400 text-yellow-400" />
									{/each}
								</div>
							</div>

							<p class="mb-3 text-gray-700">"{testimonial.text}"</p>

							<div class="flex items-center text-sm text-gray-500">
								<Clock class="mr-1 h-4 w-4" />
								{testimonial.time}
								<CheckCircle class="mr-1 ml-4 h-4 w-4 text-green-500" />
								Verified Purchase
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-6 text-center">
					<button class="font-semibold text-blue-600 hover:text-blue-700">
						View All Reviews →
					</button>
				</div>
			</div>

			<!-- Real-time Sales Section -->
			<div>
				<h3 class="mb-6 flex items-center text-2xl font-bold text-gray-800">
					<div class="mr-2 h-3 w-3 animate-pulse rounded-full bg-green-500"></div>
					Live Sales Feed
				</h3>

				<div class="rounded-lg bg-gray-50 p-6">
					<div class="space-y-4">
						{#each recentSales as sale}
							<div
								class="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
							>
								<div class="flex items-center">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white"
									>
										{sale.platform.charAt(0)}
									</div>
									<div class="ml-3">
										<div class="font-semibold text-gray-800">
											{sale.platform} • {sale.followers} followers
										</div>
										<div class="text-sm text-gray-600">
											Purchased by {sale.buyer}
										</div>
									</div>
								</div>

								<div class="text-right">
									<div class="font-semibold text-green-600">{sale.price}</div>
									<div class="text-sm text-gray-500">{sale.time}</div>
								</div>
							</div>
						{/each}
					</div>

					<div class="mt-4 text-center">
						<div class="mb-2 text-sm text-gray-600">
							<span class="font-semibold text-green-600">142 accounts</span> sold in the last 24 hours
						</div>
						<div class="text-xs text-gray-500">Updates every few seconds</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Trust Badges -->
		<div class="mt-12 text-center">
			<div class="flex flex-wrap items-center justify-center gap-8 opacity-60">
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">100% Secure Payments</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">Instant Delivery</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">24/7 Support</span>
				</div>
				<div class="flex items-center">
					<CheckCircle class="mr-2 h-5 w-5 text-green-500" />
					<span class="text-gray-600">Money Back Guarantee</span>
				</div>
			</div>
		</div>
	</div>
</section>
