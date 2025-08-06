<script>
	import { ShoppingCart, Eye, Calendar, Users, TrendingUp, Star } from '@lucide/svelte';

	let product = {
		id: 1,
		title: 'Premium Instagram Account - Fashion Niche',
		platform: 'Instagram',
		followers: '45,000',
		engagement: '4.2%',
		created: 'Jan 2022',
		posts: 342,
		price: '₦22,000',
		originalPrice: '₦28,000',
		images: ['/api/placeholder/400/600', '/api/placeholder/400/600', '/api/placeholder/400/600'],
		description:
			'High-quality Instagram account in the fashion niche with authentic followers from Nigeria and worldwide. Perfect for fashion brands, influencers, or dropshipping businesses.',
		features: [
			'Verified email access included',
			'Original phone number',
			'No previous violations',
			'High engagement rate',
			'Niche-specific followers',
			'Regular posting history'
		],
		stats: {
			avgLikes: '1,890',
			avgComments: '234',
			stories: 'Daily',
			location: 'Nigeria'
		}
	};

	let currentImageIndex = $state(0);
	let quantity = $state(1);

	let testimonials = [
		{
			name: 'Ahmed M.',
			rating: 5,
			text: 'Exactly as described! Great account with real followers.',
			date: '2 days ago'
		},
		{
			name: 'Blessing O.',
			rating: 5,
			text: 'Fast delivery and excellent quality. Highly recommend!',
			date: '1 week ago'
		},
		{
			name: 'David K.',
			rating: 5,
			text: 'Perfect for my fashion business. Worth every naira!',
			date: '2 weeks ago'
		}
	];
</script>

<div class="mx-auto max-w-7xl px-4 py-8">
	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		<!-- Product Images -->
		<div>
			<div class="relative mb-4">
				<img
					src={product.images[currentImageIndex]}
					alt="Account preview"
					class="h-96 w-full rounded-lg object-cover shadow-lg"
				/>
				<div
					class="absolute top-4 left-4 rounded-full bg-green-500 px-3 py-1 text-sm font-semibold text-white"
				>
					Available
				</div>
			</div>

			<div class="flex gap-2">
				{#each product.images as image, index}
					<button
						onclick={() => (currentImageIndex = index)}
						class="h-20 w-20 overflow-hidden rounded-lg border-2 transition-all
							{currentImageIndex === index ? 'border-blue-500' : 'border-gray-200'}"
					>
						<img src={image} alt="Preview" class="h-full w-full object-cover" />
					</button>
				{/each}
			</div>
		</div>

		<!-- Product Details -->
		<div>
			<div class="mb-4">
				<span
					class="mb-2 inline-block rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-800"
				>
					{product.platform}
				</span>
				<h1 class="mb-2 text-3xl font-bold text-gray-900">{product.title}</h1>
				<div class="flex items-center gap-4 text-gray-600">
					<div class="flex items-center">
						<Users class="mr-1 h-4 w-4" />
						{product.followers} followers
					</div>
					<div class="flex items-center">
						<TrendingUp class="mr-1 h-4 w-4" />
						{product.engagement} engagement
					</div>
					<div class="flex items-center">
						<Calendar class="mr-1 h-4 w-4" />
						Created {product.created}
					</div>
				</div>
			</div>

			<!-- Price -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<span class="text-3xl font-bold text-gray-900">{product.price}</span>
					<span class="text-xl text-gray-500 line-through">{product.originalPrice}</span>
					<span class="rounded bg-red-100 px-2 py-1 text-sm font-semibold text-red-800"
						>22% OFF</span
					>
				</div>
				<p class="font-semibold text-green-600">✓ Instant delivery after payment</p>
			</div>

			<!-- Stats Grid -->
			<div class="mb-6 grid grid-cols-2 gap-4">
				<div class="rounded-lg bg-gray-50 p-4">
					<div class="text-sm text-gray-600">Avg. Likes</div>
					<div class="text-xl font-semibold">{product.stats.avgLikes}</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-4">
					<div class="text-sm text-gray-600">Avg. Comments</div>
					<div class="text-xl font-semibold">{product.stats.avgComments}</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-4">
					<div class="text-sm text-gray-600">Stories</div>
					<div class="text-xl font-semibold">{product.stats.stories}</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-4">
					<div class="text-sm text-gray-600">Location</div>
					<div class="text-xl font-semibold">{product.stats.location}</div>
				</div>
			</div>

			<!-- Add to Cart -->
			<div class="mb-6">
				<div class="mb-4 flex items-center gap-4">
					<span class="font-semibold text-gray-700">Quantity:</span>
					<div class="flex items-center rounded-lg border">
						<button
							onclick={() => (quantity = Math.max(1, quantity - 1))}
							class="px-3 py-2 hover:bg-gray-100"
							aria-label="Decrease quantity">-</button
						>
						<span class="border-x px-4 py-2">{quantity}</span>
						<button
							onclick={() => (quantity += 1)}
							class="px-3 py-2 hover:bg-gray-100"
							aria-label="Increase quantity">+</button
						>
					</div>
				</div>

				<button
					class="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-4 font-semibold text-white transition-colors hover:bg-blue-700"
				>
					<ShoppingCart class="h-5 w-5" />
					Add to Cart - {quantity} × {product.price}
				</button>

				<button
					class="w-full rounded-lg border-2 border-blue-600 py-4 font-semibold text-blue-600 transition-colors hover:bg-blue-50"
				>
					Buy Now
				</button>
			</div>

			<!-- Features -->
			<div class="mb-6">
				<h3 class="mb-3 font-semibold text-gray-900">What's Included:</h3>
				<ul class="space-y-2">
					{#each product.features as feature}
						<li class="flex items-center text-gray-700">
							<div class="mr-3 h-2 w-2 rounded-full bg-green-500"></div>
							{feature}
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>

	<!-- Description & Testimonials -->
	<div class="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
		<!-- Description -->
		<div>
			<h3 class="mb-4 text-2xl font-bold">Account Description</h3>
			<p class="mb-6 leading-relaxed text-gray-700">{product.description}</p>

			<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
				<h4 class="mb-2 font-semibold text-blue-900">Delivery Information</h4>
				<ul class="space-y-1 text-sm text-blue-800">
					<li>• Account credentials delivered via WhatsApp, Telegram, or Email</li>
					<li>• Full login access within 5 minutes of payment</li>
					<li>• 24/7 support for any issues</li>
					<li>• Money-back guarantee if not satisfied</li>
				</ul>
			</div>
		</div>

		<!-- Testimonials -->
		<div>
			<h3 class="mb-4 text-2xl font-bold">Customer Reviews</h3>
			<div class="space-y-4">
				{#each testimonials as testimonial}
					<div class="rounded-lg bg-gray-50 p-4">
						<div class="mb-2 flex items-center justify-between">
							<span class="font-semibold text-gray-900">{testimonial.name}</span>
							<div class="flex">
								{#each Array(testimonial.rating) as _}
									<Star class="h-4 w-4 fill-yellow-400 text-yellow-400" />
								{/each}
							</div>
						</div>
						<p class="mb-1 text-sm text-gray-700">"{testimonial.text}"</p>
						<span class="text-xs text-gray-500">{testimonial.date}</span>
					</div>
				{/each}
			</div>

			<button class="mt-4 font-semibold text-blue-600 hover:text-blue-700">
				View All Reviews →
			</button>
		</div>
	</div>
</div>
