<script lang="ts">
	import {
		ShoppingCart,
		Trash2,
		Plus,
		Minus,
		MessageCircle,
		Mail,
		Send,
		User
	} from '@lucide/svelte';

	let cartItems = $state([
		{
			id: 1,
			type: 'account',
			title: 'Instagram Account - Fashion Niche',
			platform: 'Instagram',
			followers: '45,000',
			price: 22000,
			quantity: 1,
			image: '/api/placeholder/80/80'
		},
		{
			id: 2,
			type: 'service',
			title: 'TikTok Views',
			platform: 'TikTok',
			amount: '10,000 views',
			price: 250,
			quantity: 2,
			targetUrl: 'https://tiktok.com/@username/video/123456789'
		}
	]);

	let deliveryMethod = $state('whatsapp');
	let guestCheckout = $state(true);
	let contactInfo = $state({
		email: '',
		whatsapp: '',
		telegram: ''
	});

	let billingInfo = $state({
		firstName: '',
		lastName: '',
		email: '',
		phone: ''
	});

	let subtotal = $derived(cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
	let tax = $derived(Math.round(subtotal * 0.05)); // 5% tax
	let total = $derived(subtotal + tax);

	function updateQuantity(itemId: any, change: any) {
		cartItems = cartItems.map((item) =>
			item.id === itemId ? { ...item, quantity: Math.max(1, item.quantity + change) } : item
		);
	}

	function removeItem(itemId: any) {
		cartItems = cartItems.filter((item) => item.id !== itemId);
	}
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl font-bold text-gray-900">Checkout</h1>
		<p class="text-gray-600">Review your order and complete your purchase</p>
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<!-- Order Summary -->
		<div class="lg:col-span-2">
			<!-- Cart Items -->
			<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 flex items-center text-xl font-semibold">
					<ShoppingCart class="mr-2 h-5 w-5" />
					Your Order ({cartItems.length} items)
				</h2>

				<div class="space-y-4">
					{#each cartItems as item}
						<div class="flex items-center gap-4 rounded-lg border border-gray-100 p-4">
							{#if item.type === 'account'}
								<img src={item.image} alt={item.title} class="h-16 w-16 rounded-lg object-cover" />
							{:else}
								<div
									class="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-lg font-bold text-white"
								>
									{item.platform.charAt(0)}
								</div>
							{/if}

							<div class="flex-1">
								<h3 class="font-semibold text-gray-900">{item.title}</h3>
								<div class="text-sm text-gray-600">
									{item.platform} •
									{item.followers ? `${item.followers} followers` : item.amount}
								</div>
								{#if item.targetUrl}
									<div class="max-w-xs truncate text-xs text-blue-600">
										Target: {item.targetUrl}
									</div>
								{/if}
							</div>

							<div class="flex items-center gap-2">
								<button
									onclick={() => updateQuantity(item.id, -1)}
									class="rounded p-1 hover:bg-gray-100"
									aria-label="Decrease quantity"
								>
									<Minus class="h-4 w-4" />
								</button>
								<span class="w-8 text-center">{item.quantity}</span>
								<button
									onclick={() => updateQuantity(item.id, 1)}
									class="rounded p-1 hover:bg-gray-100"
									aria-label="Increase quantity"
								>
									<Plus class="h-4 w-4" />
								</button>
							</div>

							<div class="text-right">
								<div class="font-semibold">₦{(item.price * item.quantity).toLocaleString()}</div>
								<div class="text-sm text-gray-600">₦{item.price.toLocaleString()} each</div>
							</div>

							<button
								onclick={() => removeItem(item.id)}
								class="rounded p-2 text-red-600 hover:bg-red-50"
								aria-label="Remove item"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- Delivery Method -->
			<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Delivery Method</h2>
				<p class="mb-4 text-gray-600">
					Choose how you'd like to receive your purchased accounts and service confirmations
				</p>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<label
						class="flex cursor-pointer items-center rounded-lg border-2 p-4 transition-all
						{deliveryMethod === 'whatsapp'
							? 'border-green-500 bg-green-50'
							: 'border-gray-200 hover:border-gray-300'}"
					>
						<input type="radio" bind:group={deliveryMethod} value="whatsapp" class="sr-only" />
						<MessageCircle class="mr-3 h-6 w-6 text-green-600" />
						<div>
							<div class="font-semibold">WhatsApp</div>
							<div class="text-sm text-gray-600">Instant delivery via WhatsApp</div>
						</div>
					</label>

					<label
						class="flex cursor-pointer items-center rounded-lg border-2 p-4 transition-all
						{deliveryMethod === 'telegram'
							? 'border-blue-500 bg-blue-50'
							: 'border-gray-200 hover:border-gray-300'}"
					>
						<input type="radio" bind:group={deliveryMethod} value="telegram" class="sr-only" />
						<Send class="mr-3 h-6 w-6 text-blue-600" />
						<div>
							<div class="font-semibold">Telegram</div>
							<div class="text-sm text-gray-600">Secure delivery via Telegram</div>
						</div>
					</label>

					<label
						class="flex cursor-pointer items-center rounded-lg border-2 p-4 transition-all
						{deliveryMethod === 'email'
							? 'border-purple-500 bg-purple-50'
							: 'border-gray-200 hover:border-gray-300'}"
					>
						<input type="radio" bind:group={deliveryMethod} value="email" class="sr-only" />
						<Mail class="mr-3 h-6 w-6 text-purple-600" />
						<div>
							<div class="font-semibold">Email</div>
							<div class="text-sm text-gray-600">Delivery to your email inbox</div>
						</div>
					</label>

					<label
						class="flex cursor-pointer items-center rounded-lg border-2 p-4 transition-all
						{deliveryMethod === 'dashboard'
							? 'border-indigo-500 bg-indigo-50'
							: 'border-gray-200 hover:border-gray-300'}"
					>
						<input type="radio" bind:group={deliveryMethod} value="dashboard" class="sr-only" />
						<User class="mr-3 h-6 w-6 text-indigo-600" />
						<div>
							<div class="font-semibold">Dashboard</div>
							<div class="text-sm text-gray-600">Access via your account dashboard</div>
						</div>
					</label>
				</div>
			</div>

			<!-- Contact Information -->
			<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Contact Information</h2>

				<!-- Guest Checkout Toggle -->
				<div class="mb-4">
					<label class="flex cursor-pointer items-center">
						<input
							type="checkbox"
							bind:checked={guestCheckout}
							class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
						/>
						<span class="ml-2 text-gray-700">Checkout as guest (no account required)</span>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="firstName" class="mb-1 block text-sm font-medium text-gray-700"
							>First Name</label
						>
						<input
							id="firstName"
							type="text"
							bind:value={billingInfo.firstName}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="lastName" class="mb-1 block text-sm font-medium text-gray-700"
							>Last Name</label
						>
						<input
							id="lastName"
							type="text"
							bind:value={billingInfo.lastName}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="email" class="mb-1 block text-sm font-medium text-gray-700"
							>Email Address</label
						>
						<input
							id="email"
							type="email"
							bind:value={billingInfo.email}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							required
						/>
					</div>
					<div>
						<label for="phone" class="mb-1 block text-sm font-medium text-gray-700"
							>Phone Number</label
						>
						<input
							id="phone"
							type="tel"
							bind:value={billingInfo.phone}
							placeholder="+234..."
							class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							required
						/>
					</div>
				</div>

				<!-- Delivery Contact -->
				{#if deliveryMethod !== 'email' && deliveryMethod !== 'dashboard'}
					<div class="mt-4">
						<label for="deliveryContact" class="mb-1 block text-sm font-medium text-gray-700">
							{deliveryMethod === 'whatsapp' ? 'WhatsApp Number' : 'Telegram Username'}
						</label>
						{#if deliveryMethod === 'whatsapp'}
							<input
								id="deliveryContact"
								type="text"
								bind:value={contactInfo.whatsapp}
								placeholder="+234..."
								class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								required
							/>
						{:else if deliveryMethod === 'telegram'}
							<input
								id="deliveryContact"
								type="text"
								bind:value={contactInfo.telegram}
								placeholder="@username"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								required
							/>
						{:else}
							<input
								id="deliveryContact"
								type="email"
								bind:value={contactInfo.email}
								placeholder="your@email.com"
								class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
								required
							/>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Payment Summary -->
		<div class="lg:col-span-1">
			<div class="sticky top-8 rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Order Summary</h2>

				<div class="mb-4 space-y-3">
					<div class="flex justify-between">
						<span>Subtotal</span>
						<span>₦{subtotal.toLocaleString()}</span>
					</div>
					<div class="flex justify-between">
						<span>Tax (5%)</span>
						<span>₦{tax.toLocaleString()}</span>
					</div>
					<hr />
					<div class="flex justify-between text-lg font-semibold">
						<span>Total</span>
						<span class="text-blue-600">₦{total.toLocaleString()}</span>
					</div>
				</div>

				<div class="mb-4">
					<div class="mb-2 text-sm text-gray-600">Payment Method</div>
					<div class="flex items-center rounded-lg bg-gray-50 p-3">
						<div
							class="mr-3 flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white"
						>
							M
						</div>
						<div>
							<div class="font-semibold">MicroDroid</div>
							<div class="text-xs text-gray-600">Secure instant payment</div>
						</div>
					</div>
				</div>

				<div class="mb-4">
					<div class="mb-2 text-sm text-gray-600">Delivery Information</div>
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
						<p>✓ Instant delivery after payment confirmation</p>
						<p>✓ 24/7 customer support</p>
						<p>✓ Money-back guarantee</p>
					</div>
				</div>

				<button
					class="w-full rounded-lg bg-blue-600 py-4 font-semibold text-white transition-colors hover:bg-blue-700"
				>
					Complete Order - ₦{total.toLocaleString()}
				</button>

				<p class="mt-3 text-center text-xs text-gray-500">
					By completing your order, you agree to our Terms of Service and Privacy Policy
				</p>
			</div>
		</div>
	</div>
</div>
