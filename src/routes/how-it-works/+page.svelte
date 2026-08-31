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
		Clock,
		Eye,
		Copy,
		DollarSign,
		Phone,
		RefreshCw
	} from '$lib/icons';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let selectedTab = $state<'buyer' | 'numbers' | 'boosting' | 'affiliate'>(
		page.url.searchParams.get('tab') === 'affiliate'
			? 'affiliate'
			: page.url.searchParams.get('tab') === 'boosting'
				? 'boosting'
				: page.url.searchParams.get('tab') === 'numbers'
					? 'numbers'
					: 'buyer'
	);
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
		class="sticky top-16 z-10 shadow-sm"
		style="background: var(--bg-elev-1); border-bottom: 1px solid var(--border);"
	>
		<div class="mx-auto max-w-6xl overflow-x-auto px-4">
			<div class="flex min-w-max justify-start gap-2 sm:justify-center sm:gap-6">
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
					onclick={() => (selectedTab = 'numbers')}
					class="px-4 py-4 text-sm font-semibold transition-colors md:text-base"
					style="border-bottom: 2px solid {selectedTab === 'numbers'
						? '#0ea5e9'
						: 'transparent'}; color: {selectedTab === 'numbers'
						? '#0ea5e9'
						: 'var(--text-muted)'}; font-family: var(--font-head);"
				>
					<Phone class="mr-2 inline h-5 w-5" />
					Verification Numbers
				</button>
				<button
					onclick={() => (selectedTab = 'boosting')}
					class="px-4 py-4 text-sm font-semibold transition-colors md:text-base"
					style="border-bottom: 2px solid {selectedTab === 'boosting'
						? 'var(--brand-blue)'
						: 'transparent'}; color: {selectedTab === 'boosting'
						? 'var(--brand-blue)'
						: 'var(--text-muted)'}; font-family: var(--font-head);"
				>
					<Zap class="mr-2 inline h-5 w-5" />
					Boosting Services
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
									<span class="font-bold" style="color: var(--status-success);">-₦750</span>
								</div>
								<div class="pt-2" style="border-top: 1px solid var(--border);">
									<div class="flex justify-between">
										<span class="font-semibold" style="color: var(--text);">Total:</span>
										<span class="font-bold" style="color: var(--brand-blue);">₦14,250</span>
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
							Secure checkout
						</h3>
						<p style="color: var(--text-muted); font-family: var(--font-body);">
							Checkout uses an encrypted connection. Card and bank credentials are handled by our
							payment provider, not stored by FastAccs.
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
	{:else if selectedTab === 'numbers'}
		<!-- Numbers (verification) Flow Section -->
		<section class="px-4 py-16">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-3 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Verify any account in seconds
				</h2>
				<p class="mx-auto mb-12 max-w-2xl text-center" style="color: var(--text-muted);">
					Instant phone numbers for WhatsApp, Telegram, Google and more. Buy a number, receive your
					one-time code automatically — no waiting, no chat.
				</p>

				<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
					{#each [{ n: 1, icon: Phone, title: 'Pick a service', body: 'Choose from 20+ apps and a country, each with a clear Naira price.' }, { n: 2, icon: CreditCard, title: 'Pay', body: 'Checkout with Monnify or your store credit — the same fast flow as everything else.' }, { n: 3, icon: Eye, title: 'Get your number', body: 'Your number appears on the order page instantly, ready to use.' }, { n: 4, icon: RefreshCw, title: 'Code arrives', body: 'Your one-time code shows automatically in seconds. No code? Instant refund to store credit.' }] as step (step.n)}
						{@const StepIcon = step.icon}
						<div
							class="rounded-2xl p-6 text-center transition-all duration-500 {animatedSteps.includes(
								step.n
							)
								? 'translate-y-0 opacity-100'
								: 'translate-y-4 opacity-0'}"
							style="background: var(--bg-elev-1); border: 1px solid var(--border);"
						>
							<div
								class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white"
								style="background: linear-gradient(135deg, #0ea5e9, #0284c7);"
							>
								<StepIcon class="h-8 w-8" />
							</div>
							<div class="mb-1 text-sm font-bold" style="color: #0ea5e9;">Step {step.n}</div>
							<h3
								class="mb-2 text-lg font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								{step.title}
							</h3>
							<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-body);">
								{step.body}
							</p>
						</div>
					{/each}
				</div>

				<div class="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
					<button
						onclick={() => goto('/numbers')}
						class="rounded-full px-6 py-3 font-semibold text-white transition-transform active:scale-95"
						style="background: #0ea5e9;"
					>
						Get a verification number
					</button>
					<div class="flex items-center gap-4 text-sm" style="color: var(--text-muted);">
						<span class="inline-flex items-center gap-1.5"
							><Zap class="h-4 w-4" style="color:#fbbf24;" /> Instant</span
						>
						<span class="inline-flex items-center gap-1.5"
							><Shield class="h-4 w-4" style="color:#34d399;" /> No-code refund</span
						>
					</div>
				</div>
			</div>
		</section>
	{:else if selectedTab === 'boosting'}
		<!-- Boosting Flow Section -->
		<section class="px-4 py-16">
			<div class="mx-auto max-w-6xl">
				<h2
					class="mb-12 text-center text-3xl font-bold"
					style="color: var(--text); font-family: var(--font-head);"
				>
					Grow Existing Accounts in 4 Steps
				</h2>

				<div class="space-y-12">
					<!-- Step 1: Pick a Platform -->
					<div class="flex flex-col items-center gap-8 md:flex-row">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg"
							>
								<ShoppingBag class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-blue-600">Step 1</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Pick a Platform
							</h3>
							<p style="color: var(--text-muted); font-family: var(--font-body);">
								Head to Boosting Services and choose Instagram, TikTok, X, or Facebook — whichever
								platform your existing account is on.
							</p>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-blue-600 to-green-600"></div>
					</div>

					<!-- Step 2: Pick a Service -->
					<div class="flex flex-col items-center gap-8 md:flex-row-reverse">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg"
							>
								<Zap class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-right">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-end">
								<span class="text-2xl font-bold text-green-600">Step 2</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Pick a Service & Quantity
							</h3>
							<p style="color: var(--text-muted); font-family: var(--font-body);">
								Choose followers, likes, views, comments, or reposts and select how many you want.
								Pricing updates live as you adjust the quantity.
							</p>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-green-600 to-purple-600"></div>
					</div>

					<!-- Step 3: Paste Your Link -->
					<div class="flex flex-col items-center gap-8 md:flex-row">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg"
							>
								<Copy class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-left">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-start">
								<span class="text-2xl font-bold text-purple-600">Step 3</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Paste Your Link & Pay
							</h3>
							<p style="color: var(--text-muted); font-family: var(--font-body);">
								Paste the public profile or post link you want boosted, then pay securely through
								Monnify. No password or login access is ever needed.
							</p>
						</div>
					</div>

					<div class="flex justify-center">
						<div class="h-12 w-0.5 bg-gradient-to-b from-purple-600 to-orange-600"></div>
					</div>

					<!-- Step 4: Track Progress -->
					<div class="flex flex-col items-center gap-8 md:flex-row-reverse">
						<div class="flex-shrink-0">
							<div
								class="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg"
							>
								<Eye class="h-12 w-12" />
							</div>
						</div>
						<div class="flex-1 text-center md:text-right">
							<div class="mb-2 flex items-center justify-center gap-2 md:justify-end">
								<span class="text-2xl font-bold text-orange-600">Step 4</span>
							</div>
							<h3
								class="mb-3 text-2xl font-bold"
								style="color: var(--text); font-family: var(--font-head);"
							>
								Delivered & Tracked
							</h3>
							<p style="color: var(--text-muted); font-family: var(--font-body);">
								Most orders start within a few hours of payment. Track status anytime from your
								order page until it's complete.
							</p>
						</div>
					</div>
				</div>

				<div class="mt-12 text-center">
					<button
						onclick={() => goto('/services')}
						class="rounded-lg px-8 py-4 font-semibold text-white shadow-lg transition-transform hover:scale-105"
						style="background: var(--btn-primary-gradient);"
					>
						Browse Boosting Services
					</button>
				</div>
			</div>
		</section>
	{:else}
		<section class="px-4 py-12 sm:py-16">
			<div class="mx-auto max-w-5xl">
				<div class="mx-auto mb-8 max-w-2xl text-center">
					<h2
						class="mb-3 text-3xl font-bold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						Share FastAccs. Both of You Earn.
					</h2>
					<p style="color: var(--text-muted); font-family: var(--font-body);">
						Friends save 5%, and you earn 5%, on each of their first two eligible account orders—up
						to ₦1,000 each per order.
					</p>
				</div>

				<div class="grid gap-4 md:grid-cols-3">
					<div
						class="rounded-xl p-5"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<div
							class="mb-4 flex h-11 w-11 items-center justify-center rounded-lg"
							style="background: var(--status-success-bg); color: var(--status-success);"
						>
							<UserPlus class="h-5 w-5" />
						</div>
						<p
							class="mb-2 text-xs font-semibold tracking-wide uppercase"
							style="color: var(--primary);"
						>
							Step 1
						</p>
						<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">Unlock access</h3>
						<p class="text-sm" style="color: var(--text-muted);">
							Complete your first purchase. Your referral code and link appear automatically—no
							application form.
						</p>
					</div>

					<div
						class="rounded-xl p-5"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<div
							class="mb-4 flex h-11 w-11 items-center justify-center rounded-lg"
							style="background: var(--status-success-bg); color: var(--status-success);"
						>
							<Share2 class="h-5 w-5" />
						</div>
						<p
							class="mb-2 text-xs font-semibold tracking-wide uppercase"
							style="color: var(--primary);"
						>
							Step 2
						</p>
						<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">Share your link</h3>
						<p class="text-sm" style="color: var(--text-muted);">
							Send it directly or share it on WhatsApp. New buyers get the discount when they use
							your code on eligible account orders.
						</p>
					</div>

					<div
						class="rounded-xl p-5"
						style="background: var(--bg-elev-1); border: 1px solid var(--border);"
					>
						<div
							class="mb-4 flex h-11 w-11 items-center justify-center rounded-lg"
							style="background: var(--status-success-bg); color: var(--status-success);"
						>
							<DollarSign class="h-5 w-5" />
						</div>
						<p
							class="mb-2 text-xs font-semibold tracking-wide uppercase"
							style="color: var(--primary);"
						>
							Step 3
						</p>
						<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">Track your cash</h3>
						<p class="text-sm" style="color: var(--text-muted);">
							Your dashboard separates pending and available Affiliate Cash, and shows exactly when
							you can request a payout.
						</p>
					</div>
				</div>

				<div
					class="mt-6 grid gap-3 rounded-xl p-5 sm:grid-cols-3"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<div class="flex items-start gap-2 text-sm" style="color: var(--text-muted);">
						<Check class="mt-0.5 h-4 w-4 flex-shrink-0" style="color: var(--status-success);" />
						<span>Accounts only; Numbers and Boosting are excluded.</span>
					</div>
					<div class="flex items-start gap-2 text-sm" style="color: var(--text-muted);">
						<Clock class="mt-0.5 h-4 w-4 flex-shrink-0" style="color: var(--status-success);" />
						<span>Rewards become available after the return window.</span>
					</div>
					<div class="flex items-start gap-2 text-sm" style="color: var(--text-muted);">
						<DollarSign
							class="mt-0.5 h-4 w-4 flex-shrink-0"
							style="color: var(--status-success);"
						/>
						<span
							>Available cash can go toward purchases or be withdrawn; payouts run on Saturdays.</span
						>
					</div>
				</div>

				<div class="mt-8 text-center">
					<button
						onclick={() => goto('/dashboard?tab=affiliate')}
						class="btn-fa btn-fa--primary px-6"
					>
						Open Affiliate Dashboard
					</button>
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
				{selectedTab === 'affiliate' ? 'Affiliate Questions' : 'Frequently Asked Questions'}
			</h2>
			<div class="space-y-6">
				{#if selectedTab !== 'affiliate'}
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
							We use Monnify for secure payments. Supported channels can include card, bank
							transfer, and USSD based on your current Monnify configuration.
						</p>
					</details>
				{/if}

				<details
					class="group rounded-lg p-6 shadow"
					style="background: var(--bg-elev-1); border: 1px solid var(--border);"
				>
					<summary
						class="flex cursor-pointer items-center justify-between font-semibold"
						style="color: var(--text); font-family: var(--font-head);"
					>
						How do affiliate earnings work?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						After your first successful purchase, you receive a unique code and referral link.
						Friends save 5% and you earn 5% on their first two retained eligible account orders, up
						to ₦1,000 per order. Numbers and Boosting are excluded. Earnings are tracked
						automatically.
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
						What is an Affiliate Promo Code?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						It's the unique code on your affiliate dashboard. Share it (or your referral link) with
						friends and followers. Eligible new buyers save on their first two account orders, and
						you earn Cash on those same retained orders.
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
						How do referral discounts work?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						Eligible new buyers get 5% off their first two account orders, up to ₦1,000 per order.
						The affiliate earns 5% on those same retained orders. Numbers and Boosting are excluded.
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
						How do I withdraw my Cash?
						<span class="ml-4" style="color: var(--text-dim);">+</span>
					</summary>
					<p class="mt-4" style="color: var(--text-muted); font-family: var(--font-body);">
						Once your available Cash, account age, and approved bank details meet the requirements
						shown on your dashboard, you can request a payout. Payouts are processed on Saturdays.
					</p>
				</details>

				{#if selectedTab !== 'affiliate'}
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
							changes gradually. If anything looks off, contact support quickly for help (ideally
							within 2 hours). For the full quick-care guide, visit <a
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
							If you cancel at checkout, your order is marked as cancelled and no account is
							delivered. You can safely return to checkout and try again.
						</p>
					</details>
				{/if}
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
