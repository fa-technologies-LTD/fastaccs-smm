<script lang="ts">
	import { Plus, Minus, TrendingUp, Users, Clock } from '@lucide/svelte';

	let services = [
		{
			id: 1,
			title: 'Instagram Followers',
			description: 'High-quality followers from real accounts',
			platform: 'Instagram',
			icon: '📷',
			pricing: [
				{ amount: 100, price: 50, popular: false },
				{ amount: 500, price: 200, popular: true },
				{ amount: 1000, price: 350, popular: false },
				{ amount: 5000, price: 1500, popular: false }
			],
			features: ['Real accounts', 'Gradual delivery', '24/7 support', 'Money-back guarantee'],
			deliveryTime: '1-6 hours',
			quality: 'High Quality'
		},
		{
			id: 2,
			title: 'TikTok Views',
			description: 'Boost your video reach and engagement',
			platform: 'TikTok',
			icon: '🎵',
			pricing: [
				{ amount: 1000, price: 30, popular: false },
				{ amount: 10000, price: 250, popular: true },
				{ amount: 50000, price: 1000, popular: false },
				{ amount: 100000, price: 1800, popular: false }
			],
			features: ['Fast delivery', 'Real views', 'Safe for account', 'Worldwide audience'],
			deliveryTime: '30 minutes - 2 hours',
			quality: 'Premium'
		},
		{
			id: 3,
			title: 'YouTube Subscribers',
			description: 'Grow your channel with real subscribers',
			platform: 'YouTube',
			icon: '▶️',
			pricing: [
				{ amount: 50, price: 100, popular: false },
				{ amount: 250, price: 450, popular: true },
				{ amount: 500, price: 800, popular: false },
				{ amount: 1000, price: 1500, popular: false }
			],
			features: ['Real subscribers', 'Non-drop guarantee', 'Gradual delivery', 'Safe methods'],
			deliveryTime: '2-12 hours',
			quality: 'High Quality'
		}
	];

	let selectedService = $state(services[0]);
	let selectedPackage = $derived(selectedService.pricing[1]); // Default to popular option
	let quantity = $state(1);
	let customAmount = $state('');
	let userLink = $state('');

	function selectService(service: any) {
		selectedService = service;
		selectedPackage = service.pricing.find((p: any) => p.popular) || service.pricing[0];
		quantity = 1;
	}

	function selectPackage(pkg: any) {
		selectedPackage = pkg;
	}

	let totalPrice = $derived(selectedPackage.price * quantity);
	let totalAmount = $derived(selectedPackage.amount * quantity);
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8 text-center">
		<h1 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">
			Social Media Boosting Services
		</h1>
		<p class="text-xl text-gray-600">
			Grow your social media presence with our premium boosting services
		</p>
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<!-- Service Selection -->
		<div class="lg:col-span-1">
			<h3 class="mb-4 text-xl font-bold">Select Service</h3>
			<div class="space-y-3">
				{#each services as service}
					<button
						onclick={() => selectService(service)}
						class="w-full rounded-lg border-2 p-4 text-left transition-all
							{selectedService.id === service.id
							? 'border-blue-500 bg-blue-50'
							: 'border-gray-200 hover:border-gray-300'}"
					>
						<div class="mb-2 flex items-center">
							<span class="mr-3 text-2xl">{service.icon}</span>
							<div>
								<div class="font-semibold text-gray-900">{service.title}</div>
								<div class="text-sm text-gray-600">{service.platform}</div>
							</div>
						</div>
						<p class="text-sm text-gray-600">{service.description}</p>
					</button>
				{/each}
			</div>
		</div>

		<!-- Package Selection & Order Form -->
		<div class="lg:col-span-2">
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h3 class="mb-6 text-2xl font-bold">{selectedService.title}</h3>

				<!-- Service Info -->
				<div class="mb-6 grid grid-cols-2 gap-4">
					<div class="rounded-lg bg-gray-50 p-3">
						<div class="text-sm text-gray-600">Delivery Time</div>
						<div class="flex items-center font-semibold">
							<Clock class="mr-1 h-4 w-4" />
							{selectedService.deliveryTime}
						</div>
					</div>
					<div class="rounded-lg bg-gray-50 p-3">
						<div class="text-sm text-gray-600">Quality</div>
						<div class="flex items-center font-semibold">
							<TrendingUp class="mr-1 h-4 w-4" />
							{selectedService.quality}
						</div>
					</div>
				</div>

				<!-- Package Options -->
				<div class="mb-6">
					<h4 class="mb-3 font-semibold">Select Package</h4>
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
						{#each selectedService.pricing as pkg}
							<button
								onclick={() => selectPackage(pkg)}
								class="relative rounded-lg border-2 p-4 text-left transition-all
									{selectedPackage === pkg ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}"
							>
								{#if pkg.popular}
									<div
										class="absolute -top-2 left-4 rounded bg-orange-500 px-2 py-1 text-xs text-white"
									>
										Most Popular
									</div>
								{/if}
								<div class="flex items-center justify-between">
									<div>
										<div class="font-semibold">
											{pkg.amount.toLocaleString()}
											{selectedService.title.split(' ')[1]}
										</div>
										<div class="text-sm text-gray-600">₦{pkg.price}</div>
									</div>
									<div class="font-semibold text-blue-600">
										₦{((pkg.price / pkg.amount) * 1000).toFixed(1)}/1K
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<!-- Quantity Selector -->
				<div class="mb-6">
					<label for="quantity-input" class="mb-2 block font-semibold">Quantity</label>
					<div class="flex items-center gap-4">
						<div class="flex items-center rounded-lg border">
							<button
								onclick={() => (quantity = Math.max(1, quantity - 1))}
								class="p-2 hover:bg-gray-100"
								aria-label="Decrease quantity"
							>
								<Minus class="h-4 w-4" />
							</button>
							<input
								id="quantity-input"
								type="number"
								bind:value={quantity}
								min="1"
								class="min-w-[60px] border-x px-4 py-2 text-center focus:outline-none"
							/>
							<button
								onclick={() => (quantity += 1)}
								class="p-2 hover:bg-gray-100"
								aria-label="Increase quantity"
							>
								<Plus class="h-4 w-4" />
							</button>
						</div>
						<div class="text-gray-600">
							Total: <span class="font-semibold">{totalAmount.toLocaleString()}</span>
							{selectedService.title.split(' ')[1]}
						</div>
					</div>
				</div>

				<!-- Link Input -->
				<div class="mb-6">
					<label for="profile-link" class="mb-2 block font-semibold">
						{selectedService.platform} Profile/Post Link
					</label>
					<input
						id="profile-link"
						type="url"
						bind:value={userLink}
						placeholder="Paste your {selectedService.platform} link here..."
						class="w-full rounded-lg border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
					<p class="mt-1 text-sm text-gray-600">
						Make sure your account is public for faster delivery
					</p>
				</div>

				<!-- Features -->
				<div class="mb-6">
					<h4 class="mb-3 font-semibold">What You Get:</h4>
					<ul class="space-y-2">
						{#each selectedService.features as feature}
							<li class="flex items-center text-gray-700">
								<div class="mr-3 h-2 w-2 rounded-full bg-green-500"></div>
								{feature}
							</li>
						{/each}
					</ul>
				</div>

				<!-- Order Summary -->
				<div class="border-t pt-6">
					<div class="mb-4 rounded-lg bg-gray-50 p-4">
						<h4 class="mb-2 font-semibold">Order Summary</h4>
						<div class="mb-2 flex items-center justify-between">
							<span>{selectedService.title}</span>
							<span>₦{selectedPackage.price}</span>
						</div>
						<div class="mb-2 flex items-center justify-between">
							<span>Quantity</span>
							<span>×{quantity}</span>
						</div>
						<div class="mb-2 flex items-center justify-between text-sm text-gray-600">
							<span>Total {selectedService.title.split(' ')[1]}</span>
							<span>{totalAmount.toLocaleString()}</span>
						</div>
						<hr class="my-2" />
						<div class="flex items-center justify-between text-lg font-bold">
							<span>Total Price</span>
							<span class="text-blue-600">₦{totalPrice.toLocaleString()}</span>
						</div>
					</div>

					<button
						disabled={!userLink}
						class="w-full rounded-lg bg-blue-600 py-4 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
					>
						{userLink
							? `Order Now - ₦${totalPrice.toLocaleString()}`
							: 'Enter Profile Link to Continue'}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
