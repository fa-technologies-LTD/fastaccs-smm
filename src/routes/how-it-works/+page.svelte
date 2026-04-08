<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import {
		UserPlus,
		ShoppingBag,
		Zap,
		Shield,
		Check,
		CreditCard,
		Package,
		Share2,
		TrendingUp,
		Lock,
		Clock,
		Eye,
		Copy,
		DollarSign
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let selectedTab = $state<'buyer' | 'affiliate'>('buyer');
	let animatedSteps = $state<number[]>([]);

	onMount(() => {
		// Animate steps one by one
		[1, 2, 3, 4].forEach((step, index) => {
			setTimeout(() => {
				animatedSteps = [...animatedSteps, step];
			}, index * 200);
		});
	});
</script>

<svelte:head>
	<title>How It Works - FastAccs</title>
	<meta
		name="description"
		content="Learn how to buy premium social media accounts through secure Monnify checkout and earn as an affiliate on FastAccs."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg);">
	<!-- Hero Section -->
	<section class="px-4 py-16 text-white" style="background: var(--btn-primary-gradient);">
		<div class="mx-auto max-w-6xl text-center">
			<h1 class="mb-4 text-4xl font-bold md:text-5xl">How FastAccs Works</h1>
			<p class="mx-auto max-w-2xl text-lg text-green-100 md:text-xl">
				Follow a simple flow to purchase accounts, complete checkout, and receive your details in
				your dashboard.
			</p>
		</div>
	</section>

	<!-- Tab Navigation -->
	<section
		class="sticky top-0 z-10 shadow-sm"
		style="background: var(--bg-elev-1); border-bottom: 1px solid var(--border);"
	>
		<div class="mx-auto max-w-6xl px-4">
			<div class="flex justify-center space-x-8">
				<button
					onclick={() => (selectedTab = 'buyer')}
					class="px-4 py-4 text-sm font-semibold transition-colors md:text-base"
					style="border-bottom: 2px solid {selectedTab === 'buyer'
						? 'var(--brand-blue)'
						: 'transparent'}; color: {selectedTab === 'buyer'
						? 'var(--brand-blue)'
						: 'var(--text-muted)'}; font-family: var(--font-head);"
				>
					<ShoppingBag class="mr-2 inline h-5 w-5" />
					Buying Accounts
				</button>
				<button
					onclick={() => (selectedTab = 'affiliate')}
					class="px-4 py-4 text-sm font-semibold transition-colors md:text-base"
					style="border-bottom: 2px solid {selectedTab === 'affiliate'
						? 'var(--brand-blue)'
						: 'transparent'}; color: {selectedTab === 'affiliate'
						? 'var(--brand-blue)'
						: 'var(--text-muted)'}; font-family: var(--font-head);"
				>
					<Share2 class="mr-2 inline h-5 w-5" />
					Affiliate Program
				</button>
			</div>
		</div>
	</section>

	{#if selectedTab === 'buyer'}
		<!-- Buyer Flow Section -->
		<section class="px-4 py-16">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-12 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					4 Simple Steps to Get Your Account
				</h2>

				<!-- Steps -->
				<div class="space-y-12">
					<!-- Step 1: Sign Up -->
					<div
						class="flex flex-col items-center gap-8 md:flex-row {animatedSteps.includes(1)
							? 'translate-y-0 opacity-100'
							: 'translate-y-4 opacity-0'} transition-all duration-500"
					>
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg"
							>
								<UserPlus class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-blue-600">Step 1</span>
								<span
									class="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
									>Quick & Easy</span
								>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Create Your Account
							</h3>
							<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
								Sign up with your email or use Google OAuth for instant access. No lengthy forms,
								just the essentials to get you started.
							</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Email + password or Google sign-in</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Free to join, no hidden fees</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Instant dashboard access</span>
								</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4 flex items-center justify-between">
								<h4
									class="font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Account Created!
								</h4>
								<UserPlus class="h-5 w-5" style="color: var(--status-success);" />
							</div>
							<div
								class="space-y-3 text-sm"
								style="color: var(--text-muted); font-family: var(--font-body);"
							>
								<div class="flex items-center gap-2">
									<div
										class="h-2 w-2 rounded-full"
										style="background: var(--status-success);"
									></div>
									<span>Email verified</span>
								</div>
								<div class="flex items-center gap-2">
									<div
										class="h-2 w-2 rounded-full"
										style="background: var(--status-success);"
									></div>
									<span>Dashboard ready</span>
								</div>
									<div class="flex items-center gap-2">
										<div
											class="h-2 w-2 rounded-full"
											style="background: var(--status-success);"
										></div>
										<span>Profile initialized</span>
									</div>
								</div>
							</div>
						</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-blue-600 to-purple-600"></div>
					</div>

						<!-- Step 2: Secure Checkout -->
					<div
						class="flex flex-col items-center gap-8 md:flex-row-reverse {animatedSteps.includes(2)
							? 'translate-y-0 opacity-100'
							: 'translate-y-4 opacity-0'} transition-all duration-500"
					>
						<div class="flex-shrink-0">
								<div
									class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg"
								>
									<CreditCard class="h-12 w-12" />
								</div>
						</div>
						<div class="flex-1 text-center md:text-right">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-end">
								<span class="text-2xl font-bold text-green-600">Step 2</span>
								<span class="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
									>Secure Payment</span
								>
							</div>
								<h3
									class="mb-3 text-2xl font-bold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Complete Secure Checkout
								</h3>
								<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
									Pay securely through Monnify using card, bank transfer, or USSD. You are redirected
									to Monnify checkout and returned automatically for verification.
								</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Multiple payment methods</span>
								</li>
									<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
										<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
										<span>Hosted Monnify checkout flow</span>
									</li>
									<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
										<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
										<span>Server-side payment verification before fulfillment</span>
									</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4 flex items-center justify-between">
								<h4
									class="font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Payment Options
								</h4>
								<CreditCard class="h-5 w-5" style="color: var(--brand-blue);" />
							</div>
							<div class="space-y-3">
								<div
									class="flex items-center justify-between rounded-lg p-3"
									style="border: 1px solid var(--border);"
								>
									<span class="text-sm font-medium" style="color: var(--text);">Debit Card</span>
									<Check class="h-5 w-5" style="color: var(--status-success);" />
								</div>
								<div
									class="flex items-center justify-between rounded-lg p-3"
									style="border: 1px solid var(--border);"
								>
									<span class="text-sm font-medium" style="color: var(--text);">Bank Transfer</span>
									<Check class="h-5 w-5" style="color: var(--status-success);" />
								</div>
								<div
									class="flex items-center justify-between rounded-lg p-3"
									style="border: 1px solid var(--border);"
								>
									<span class="text-sm font-medium" style="color: var(--text);">Mobile Money</span>
									<Check class="h-5 w-5" style="color: var(--status-success);" />
								</div>
							</div>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-green-600 to-yellow-600"></div>
					</div>

					<!-- Step 3: Browse & Purchase -->
					<div
						class="flex flex-col items-center gap-8 md:flex-row {animatedSteps.includes(3)
							? 'translate-y-0 opacity-100'
							: 'translate-y-4 opacity-0'} transition-all duration-500"
					>
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg"
							>
								<ShoppingBag class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-yellow-600">Step 3</span>
								<span
									class="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
									>Wide Selection</span
								>
							</div>
								<h3
									class="mb-3 text-2xl font-bold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Browse & Buy Accounts
								</h3>
									<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
										Browse currently active platforms and available account tiers. Filter by category,
										price, and features, then complete checkout securely.
									</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Multiple platforms available</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Apply affiliate discount codes</span>
								</li>
									<li class="flex items-start gap-2" style="color: var(--text);">
										<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
										<span>Order auto-completion after confirmed payment</span>
									</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4 flex items-center justify-between">
								<h4
									class="font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Sample Account
								</h4>
								<Package class="h-5 w-5" style="color: var(--status-warning);" />
							</div>
							<div
								class="mb-3 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 p-4 text-white"
							>
								<div class="mb-2 text-sm font-medium">Instagram Account</div>
								<div class="text-2xl font-bold">50K Followers</div>
							</div>
							<div class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span style="color: var(--text-muted);">Price:</span>
									<span class="font-bold" style="color: var(--text);">₦15,000</span>
								</div>
								<div class="flex justify-between">
									<span style="color: var(--text-muted);">Discount:</span>
									<span class="font-bold" style="color: var(--status-success);">-₦1,500</span>
								</div>
								<div class="pt-2" style="border-top: 1px solid var(--border);">
									<div class="flex justify-between">
										<span class="font-semibold" style="color: var(--text);">Total:</span>
										<span class="font-bold" style="color: var(--brand-blue);">₦13,500</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-yellow-600 to-green-600"></div>
					</div>

					<!-- Step 4: Get Accounts -->
					<div
						class="flex flex-col items-center gap-8 md:flex-row-reverse {animatedSteps.includes(4)
							? 'translate-y-0 opacity-100'
							: 'translate-y-4 opacity-0'} transition-all duration-500"
					>
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-blue-600 text-white shadow-lg"
							>
								<Zap class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-right">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-end">
								<span class="text-2xl font-bold text-green-600">Step 4</span>
								<span
									class="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
									>Instant Access</span
								>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Instant Account Delivery
							</h3>
							<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
								Accounts are delivered instantly to your dashboard. View credentials, copy details,
								and start using your new account right away. Email notification sent automatically.
							</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Immediate delivery to dashboard</span>
								</li>
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Mask/unmask sensitive credentials</span>
								</li>
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>One-click copy to clipboard</span>
								</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4 flex items-center justify-between">
								<h4
									class="font-semibold"
									style="color: var(--text); font-family: var(--font-head);"
								>
									Your Purchase
								</h4>
								<Check class="h-5 w-5" style="color: var(--status-success);" />
							</div>
							<div class="space-y-3">
								<div class="rounded-lg p-3" style="background: var(--bg);">
									<div class="mb-1 text-xs" style="color: var(--text-dim);">Username</div>
									<div class="flex items-center justify-between">
										<code class="font-mono text-sm" style="color: var(--text);">@premium_acc</code>
										<Copy class="h-4 w-4 cursor-pointer" style="color: var(--text-dim);" />
									</div>
								</div>
								<div class="rounded-lg p-3" style="background: var(--bg);">
									<div class="mb-1 text-xs" style="color: var(--text-dim);">Password</div>
									<div class="flex items-center justify-between">
										<code class="font-mono text-sm" style="color: var(--text);">••••••••</code>
										<Eye class="h-4 w-4 cursor-pointer" style="color: var(--text-dim);" />
									</div>
								</div>
								<div class="rounded-lg p-3" style="background: var(--bg);">
									<div class="mb-1 text-xs" style="color: var(--text-dim);">Email</div>
									<div class="flex items-center justify-between">
										<code class="font-mono text-sm" style="color: var(--text);"
											>acc@example.com</code
										>
										<Copy class="h-4 w-4 cursor-pointer" style="color: var(--text-dim);" />
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- CTA -->
				<div class="mt-16 text-center">
					<button
						onclick={() => goto('/auth/login')}
						class="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-105"
					>
						Get Started Now
					</button>
				</div>
			</div>
		</section>

		<!-- Why Choose Us Section -->
		<section class="px-4 py-16" style="background: var(--bg-elev-1);">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-12 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Why Choose FastAccs?
				</h2>
				<div class="grid gap-8 md:grid-cols-3">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100"
						>
							<Shield class="h-8 w-8 text-blue-600" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							100% Secure
						</h3>
						<p style="color: var(--text-muted); font-family: var(--font-body);">
							All transactions are encrypted and secure. Your payment information is never stored.
						</p>
					</div>
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
						>
							<Clock class="h-8 w-8 text-green-600" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Instant Delivery
						</h3>
						<p style="color: var(--text-muted); font-family: var(--font-body);">
							Automated system delivers accounts immediately after payment. No waiting required.
						</p>
					</div>
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100"
						>
							<TrendingUp class="h-8 w-8 text-purple-600" />
						</div>
							<h3
								class="mb-2 text-xl font-semibold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Premium Quality
							</h3>
							<p style="color: var(--text-muted); font-family: var(--font-body);">
								Account listings are organized by tier details so you can choose what best matches
								your goals.
							</p>
						</div>
				</div>
			</div>
		</section>
	{:else}
		<!-- Affiliate Flow Section -->
		<section class="px-4 py-16">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-12 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Earn Commissions as an Affiliate
				</h2>

				<!-- Affiliate Steps -->
				<div class="space-y-12">
					<!-- Step 1: Enable Affiliate -->
					<div class="flex flex-col items-center gap-8 md:flex-row">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg"
							>
								<UserPlus class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-purple-600">Step 1</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Enable Affiliate Mode
							</h3>
							<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
								Go to your dashboard and click "Become an Affiliate". System automatically generates
								your unique code using your initials + running number (e.g., "JD001").
							</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Free to join, no fees</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Unique code generated instantly</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Access to affiliate dashboard</span>
								</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4 text-center">
								<div class="mb-2 text-sm" style="color: var(--text-muted);">
									Your Affiliate Code
								</div>
								<div
									class="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 text-3xl font-bold text-white"
								>
									JD001
								</div>
							</div>
							<div class="space-y-2 text-sm" style="color: var(--text-muted);">
								<div class="flex items-center justify-between">
									<span>Commission Rate:</span>
									<span class="font-bold" style="color: var(--status-success);">10%</span>
								</div>
								<div class="flex items-center justify-between">
									<span>Status:</span>
									<span class="font-bold" style="color: var(--status-success);">Active</span>
								</div>
							</div>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-purple-600 to-blue-600"></div>
					</div>

					<!-- Step 2: Share Code -->
					<div class="flex flex-col items-center gap-8 md:flex-row-reverse">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg"
							>
								<Share2 class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-right">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-end">
								<span class="text-2xl font-bold text-blue-600">Step 2</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Share Your Code
							</h3>
							<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
								Share your affiliate code or referral link with friends, social media followers, or
								customers. They get a discount, you earn commissions.
							</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Customers get 10% discount</span>
								</li>
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Easy copy-paste sharing</span>
								</li>
								<li class="flex items-start gap-2 md:justify-end" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Unique referral link provided</span>
								</li>
							</ul>
						</div>
						<div
							class="w-full rounded-xl p-6 shadow-lg md:w-80"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div class="mb-4">
								<div class="mb-2 text-sm font-medium" style="color: var(--text);">
									Referral Link
								</div>
								<div class="flex items-center gap-2 rounded-lg p-3" style="background: var(--bg);">
									<code
										class="flex-1 overflow-hidden text-xs text-ellipsis"
										style="color: var(--text);">fastaccs.vercel.app/?ref=JD001</code
									>
									<Copy
										class="h-4 w-4 flex-shrink-0 cursor-pointer"
										style="color: var(--text-dim);"
									/>
								</div>
							</div>
							<div class="grid grid-cols-3 gap-2">
								<button
									class="rounded-lg p-2 text-xs font-medium transition-colors"
									style="border: 1px solid var(--border); color: var(--text);"
								>
									WhatsApp
								</button>
								<button
									class="rounded-lg p-2 text-xs font-medium transition-colors"
									style="border: 1px solid var(--border); color: var(--text);"
								>
									Twitter
								</button>
								<button
									class="rounded-lg p-2 text-xs font-medium transition-colors"
									style="border: 1px solid var(--border); color: var(--text);"
								>
									Facebook
								</button>
							</div>
						</div>
					</div>
					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-blue-600 to-green-600"></div>
					</div>

					<!-- Step 3: Track Earnings -->
					<div class="flex flex-col items-center gap-8 md:flex-row">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg"
							>
								<DollarSign class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-green-600">Step 3</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Track Your Earnings
							</h3>
							<p class="mb-4" style="color: var(--text-muted); font-family: var(--font-body);">
								Every time someone uses your code, you earn 10% commission. Track all referrals,
								sales, and commissions in your affiliate dashboard.
							</p>
							<ul class="space-y-2">
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>10% commission on every order</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Real-time commission tracking</span>
								</li>
								<li class="flex items-start gap-2" style="color: var(--text);">
									<Check class="mt-1 h-5 w-5 flex-shrink-0" style="color: var(--status-success);" />
									<span>Monthly performance reports</span>
								</li>
							</ul>
						</div>
						<div class="w-full rounded-xl bg-white p-6 shadow-lg md:w-80">
							<div class="mb-4">
								<h4 class="font-semibold text-gray-900">Affiliate Stats</h4>
							</div>
							<div class="space-y-4">
								<div class="rounded-lg bg-green-50 p-4">
									<div class="mb-1 text-sm text-gray-600">Total Earned</div>
									<div class="text-2xl font-bold text-green-600">₦125,000</div>
								</div>
								<div class="grid grid-cols-2 gap-3">
									<div class="rounded-lg bg-gray-50 p-3">
										<div class="mb-1 text-xs text-gray-600">Referrals</div>
										<div class="text-xl font-bold text-gray-900">45</div>
									</div>
									<div class="rounded-lg bg-gray-50 p-3">
										<div class="mb-1 text-xs text-gray-600">Total Sales</div>
										<div class="text-xl font-bold text-gray-900">₦1.25M</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Affiliate CTA -->
				<div class="mt-16 text-center">
					<button
						onclick={() => goto('/dashboard')}
						class="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:scale-105"
					>
						Become an Affiliate
					</button>
				</div>
			</div>
		</section>

		<!-- Affiliate Benefits -->
		<section class="px-4 py-16" style="background: var(--bg-elev-1);">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-12 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Affiliate Benefits
				</h2>
				<div class="grid gap-8 md:grid-cols-4">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
							style="background: var(--bg-elev-2); border: 1px solid var(--border);"
						>
							<DollarSign class="h-8 w-8" style="color: var(--primary);" />
						</div>
						<h3
							class="mb-2 text-lg font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							10% Commission
						</h3>
						<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
							Earn on every purchase made with your code
						</p>
					</div>
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
							style="background: var(--bg-elev-2); border: 1px solid var(--border);"
						>
							<Clock class="h-8 w-8" style="color: var(--fa-blue-500);" />
						</div>
						<h3
							class="mb-2 text-lg font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Instant Tracking
						</h3>
						<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
							Real-time updates on referrals and commissions
						</p>
					</div>
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
							style="background: var(--bg-elev-2); border: 1px solid var(--border);"
						>
							<TrendingUp class="h-8 w-8" style="color: var(--fa-lime-700);" />
						</div>
						<h3
							class="mb-2 text-lg font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							No Limits
						</h3>
						<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
							Unlimited earning potential, refer as many as you can
						</p>
					</div>
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
							style="background: var(--bg-elev-2); border: 1px solid var(--border);"
						>
							<Lock class="h-8 w-8" style="color: var(--status-warning);" />
						</div>
						<h3
							class="mb-2 text-lg font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							Free to Join
						</h3>
						<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
							No sign-up fees or hidden charges
						</p>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- FAQ Section -->
	<section class="px-4 py-16" style="background: var(--bg-elev-2);">
		<div class="mx-auto max-w-4xl">
			<h2
				class="mb-12 text-center text-3xl font-bold"
				style="color: var(--text); font-family: var(--font-head);"
			>
				Frequently Asked Questions
			</h2>
			<div class="space-y-6">
					<details
						class="group rounded-lg p-6 shadow"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						How long does delivery take?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						Delivery is instant! Once your payment is confirmed, accounts are automatically
						allocated and delivered to your dashboard within seconds. You'll also receive an email
						notification with a link to access your purchases.
					</p>
				</details>

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						What payment methods do you accept?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
						<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
							We use Monnify for secure payments. Supported channels can include card, bank transfer,
							and USSD based on your current Monnify configuration.
						</p>
					</details>

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						How do affiliate commissions work?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						When you become an affiliate, you get a unique code (e.g., "JD001"). When someone uses
						your code at checkout, they get a 10% discount and you earn 10% commission on their
						order total. Commissions are tracked automatically in your dashboard.
					</p>
				</details>

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Can I get a refund if I'm not satisfied?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						If an order does not match its listing details or has issues, contact support for
						review and resolution.
					</p>
				</details>

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Best first 24 hours after delivery
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						Test login as soon as possible, keep early activity natural, and make security/profile
						changes gradually. If anything looks off, contact support quickly for help (ideally within
						2 hours). For the full quick-care guide, visit <a
							href="/support#faq"
							style="color: var(--link);"
							class="hover:underline">Support FAQ</a
						>.
					</p>
				</details>

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
						<summary
							class="flex cursor-pointer items-center justify-between font-semibold"
							style="color: var(--text); font-family: var(--font-head);"
						>
							What happens if payment is cancelled?
							<span class="ml-4" style="color: var(--text-dim);">+</span>
						</summary>
						<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
							If you cancel at checkout, your order is marked as cancelled and no account is delivered.
							You can safely return to checkout and try again.
						</p>
					</details>
			</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="px-4 py-16 text-white" style="background: var(--btn-primary-gradient);">
		<div class="mx-auto max-w-4xl text-center">
			<h2 class="mb-4 text-3xl font-bold md:text-4xl">Ready to Get Started?</h2>
			<p class="mb-8 text-lg text-green-100">
				Buy accounts or join the affiliate program in a few quick steps.
			</p>
			<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<button
					onclick={() => goto('/auth/login')}
					class="w-full rounded-full px-8 py-4 font-semibold shadow-lg transition-transform hover:scale-105 sm:w-auto"
					style="background: var(--bg-elev-1); color: var(--brand-blue); font-family: var(--font-head);"
				>
					Create Free Account
				</button>
				<button
					onclick={() => goto('/platforms')}
					class="w-full rounded-full px-8 py-4 font-semibold text-white transition-all sm:w-auto"
					style="border: 2px solid white; background: transparent; font-family: var(--font-head);"
				>
					Browse Accounts
				</button>
			</div>
		</div>
	</section>
</main>

<Footer />

<style>
	details summary::-webkit-details-marker {
		display: none;
	}

	details[open] summary span {
		transform: rotate(45deg);
	}

	details summary span {
		transition: transform 0.2s;
	}
</style>
