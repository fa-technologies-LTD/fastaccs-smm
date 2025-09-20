<script>
	import { ShoppingCart } from '@lucide/svelte';

	// This component will receive real product data as props
	let {
		product = {
			id: 1,
			title: 'Premium Social Media Account',
			platform: 'Instagram',
			images: ['/api/placeholder/400/600', '/api/placeholder/400/600', '/api/placeholder/400/600'],
			description:
				'High-quality social media account with authentic followers and engagement. Perfect for businesses, influencers, or content creators.',
			features: [
				'Verified email access included',
				'Original phone number',
				'No previous violations',
				'High engagement rate',
				'Quality followers',
				'Regular posting history'
			]
		}
	} = $props();

	let currentImageIndex = $state(0);
	let quantity = $state(1);
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
			</div>

			<!-- Price -->
			<div class="mb-6">
				<p class="font-semibold text-green-600">✓ Contact us for pricing and availability</p>
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
					Add to Cart ({quantity})
				</button>

				<button
					class="w-full rounded-lg border-2 border-blue-600 py-4 font-semibold text-blue-600 transition-colors hover:bg-blue-50"
				>
					Contact for Details
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

	<!-- Description -->
	<div class="mt-12">
		<h3 class="mb-4 text-2xl font-bold">Account Description</h3>
		<p class="mb-6 leading-relaxed text-gray-700">{product.description}</p>

		<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
			<h4 class="mb-2 font-semibold text-blue-900">Delivery Information</h4>
			<ul class="space-y-1 text-sm text-blue-800">
				<li>• Account credentials delivered via secure channels</li>
				<li>• Full verification and support included</li>
				<li>• Professional customer support</li>
				<li>• Quality guarantee on all accounts</li>
			</ul>
		</div>
	</div>
</div>
