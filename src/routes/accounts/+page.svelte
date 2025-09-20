<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Instagram,
		Music,
		Facebook,
		Twitter,
		Heart,
		Eye,
		Star,
		Filter,
		Search,
		ShoppingCart,
		Users,
		Calendar
	} from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import ImagePreviewModal from '$lib/components/ImagePreviewModal.svelte';

	interface Props {
		data: {
			accounts: Array<{
				id: string;
				title: string;
				platform: string;
				follower_count: number;
				following_count: number;
				posts_count: number;
				created_date: string;
				category: string;
				engagement_rate: number;
				verified: boolean;
				account_age_months: number;
				two_factor_enabled: boolean;
				easy_login_enabled: boolean;
				price: number;
				images: string[];
			}>;
		};
	}

	let { data }: Props = $props();

	// Filter state - using Svelte 5 runes syntax
	let searchTerm = $state('');
	let selectedPlatform = $state('');
	let selectedCategory = $state('');
	let selectedVerification = $state('');
	let selectedFollowerRange = $state('');
	let sortBy = $state('newest');
	let showImagePreview = $state(false);
	let previewImages: string[] = $state([]);

	// Follower range categories
	const followerRanges: Array<{
		label: string;
		value: string;
		min?: number;
		max?: number;
	}> = [
		{ label: 'All Ranges', value: '' },
		{ label: '0 - 5K', value: '0-5000', min: 0, max: 5000 },
		{ label: '5K - 10K', value: '5000-10000', min: 5000, max: 10000 },
		{ label: '10K - 50K', value: '10000-50000', min: 10000, max: 50000 },
		{ label: '50K - 100K', value: '50000-100000', min: 50000, max: 100000 },
		{ label: '100K - 500K', value: '100000-500000', min: 100000, max: 500000 },
		{ label: '500K+', value: '500000+', min: 500000, max: Infinity }
	];

	// Platform icons mapping
	const platformIcons: Record<string, any> = {
		instagram: Instagram,
		tiktok: Music,
		facebook: Facebook,
		twitter: Twitter
	};

	// Use accounts from loaded data
	const accounts = data.accounts;

	let filteredAccounts = $derived(
		accounts
			.filter((account) => {
				const matchesSearch =
					account.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
					account.platform.toLowerCase().includes(searchTerm.toLowerCase()) ||
					account.category.toLowerCase().includes(searchTerm.toLowerCase());

				const matchesPlatform = !selectedPlatform || account.platform === selectedPlatform;
				const matchesCategory = !selectedCategory || account.category === selectedCategory;
				const matchesVerification =
					!selectedVerification ||
					(selectedVerification === 'verified' && account.verified) ||
					(selectedVerification === 'non-verified' && !account.verified);

				const matchesFollowerRange = (() => {
					if (!selectedFollowerRange) return true;
					const range = followerRanges.find((r) => r.value === selectedFollowerRange);
					if (!range || range.min === undefined || range.max === undefined) return true;
					return account.follower_count >= range.min && account.follower_count <= range.max;
				})();

				return (
					matchesSearch &&
					matchesPlatform &&
					matchesCategory &&
					matchesVerification &&
					matchesFollowerRange
				);
			})
			.sort((a, b) => {
				switch (sortBy) {
					case 'price_low':
						return a.price - b.price;
					case 'price_high':
						return b.price - a.price;
					case 'followers':
						return (b.follower_count || 0) - (a.follower_count || 0);
					case 'engagement':
						return (b.engagement_rate || 0) - (a.engagement_rate || 0);
					case 'newest':
					default:
						return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
				}
			})
	);

	function formatFollowers(count: number) {
		if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
		if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
		return count.toString();
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short'
		});
	}
</script>

<svelte:head>
	<title>Social Media Accounts - FastAccs</title>
	<meta
		name="description"
		content="Browse our collection of premium verified social media accounts. Instagram, TikTok, Facebook, Twitter accounts with real followers and high engagement rates."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen bg-gray-50">
	<!-- Header Section -->
	<section class="bg-gradient-primary px-4 py-12 text-white">
		<div class="mx-auto max-w-6xl text-center">
			<h1 class="mb-4 text-4xl font-bold md:text-5xl">Premium Social Media Accounts</h1>
			<p class="mb-8 text-xl opacity-90">
				Verified accounts with authentic engagement and real followers, ready for immediate use
			</p>

			<!-- Search Bar -->
			<div class="mx-auto max-w-2xl">
				<div class="relative">
					<Search class="absolute top-4 left-4 h-5 w-5 text-gray-400" />
					<input
						type="text"
						placeholder="Search accounts by platform or category..."
						bind:value={searchTerm}
						class="w-full rounded-lg border-0 py-4 pr-4 pl-12 text-gray-900 focus:ring-2 focus:ring-blue-300"
					/>
				</div>
			</div>
		</div>
	</section>

	<!-- Filters and Results -->
	<section class="px-4 py-8">
		<div class="mx-auto max-w-6xl">
			<!-- Filters Row -->
			<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<!-- Platform Filter -->
				<select
					bind:value={selectedPlatform}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
				>
					<option value="">All Platforms</option>
					<option value="instagram">Instagram</option>
					<option value="tiktok">TikTok</option>
					<option value="facebook">Facebook</option>
					<option value="twitter">Twitter</option>
				</select>

				<!-- Verification Filter -->
				<select
					bind:value={selectedVerification}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
				>
					<option value="">All Accounts</option>
					<option value="verified">Verified Only</option>
					<option value="non-verified">Non-Verified Only</option>
				</select>

				<!-- Follower Range Filter -->
				<select
					bind:value={selectedFollowerRange}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
				>
					{#each followerRanges as range}
						<option value={range.value}>{range.label}</option>
					{/each}
				</select>

				<!-- Category Filter -->
				<select
					bind:value={selectedCategory}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
				>
					<option value="">All Categories</option>
					<option value="fashion">Fashion</option>
					<option value="tech">Tech</option>
					<option value="lifestyle">Lifestyle</option>
					<option value="business">Business</option>
				</select>

				<!-- Sort Filter -->
				<select
					bind:value={sortBy}
					class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-sm"
				>
					<option value="newest">Newest First</option>
					<option value="followers">Most Followers</option>
					<option value="engagement">Best Engagement</option>
					<option value="price_low">Price: Low to High</option>
					<option value="price_high">Price: High to Low</option>
				</select>
			</div>

			<!-- Results Summary -->
			<div class="mb-6 flex items-center justify-between">
				<div class="text-sm text-gray-600">
					{filteredAccounts.length} accounts found
				</div>
				<button
					onclick={() => {
						searchTerm = '';
						selectedPlatform = '';
						selectedCategory = '';
						selectedVerification = '';
						selectedFollowerRange = '';
						sortBy = 'newest';
					}}
					class="text-sm text-blue-600 hover:text-blue-800"
				>
					Clear all filters
				</button>
			</div>

			<!-- No Results -->
			{#if filteredAccounts.length === 0}
				<div class="py-12 text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
					>
						<Search class="h-8 w-8 text-gray-400" />
					</div>
					<h3 class="mb-2 text-xl font-semibold text-gray-900">No accounts found</h3>
					<p class="text-gray-600">Try adjusting your search criteria or browse all accounts.</p>
				</div>
			{/if}

			<!-- Account Grid -->
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each filteredAccounts as account}
					{@const PlatformIcon = platformIcons[account.platform] || Instagram}
					<div class="overflow-hidden rounded-xl bg-white shadow-md transition-all hover:shadow-lg">
						<!-- Account Platform Header -->
						<div
							class="relative flex h-32 items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"
						>
							<div class="text-center text-white">
								<PlatformIcon class="mx-auto mb-2 h-12 w-12" />
								<div class="text-lg font-semibold">
									{account.platform.charAt(0).toUpperCase() + account.platform.slice(1)} Account
								</div>
							</div>
							<div class="absolute top-3 right-3 flex flex-col gap-2">
								{#if account.verified}
									<div
										class="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-xs font-semibold text-white"
									>
										<Star class="h-3 w-3" />
										Verified
									</div>
								{/if}
								{#if account.images && account.images.length > 0}
									<div
										class="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-xs text-white"
									>
										<Eye class="h-3 w-3" />
										{account.images.length} photos
									</div>
								{/if}
							</div>
						</div>

						<!-- Account Details -->
						<div class="p-4">
							<h3 class="mb-2 text-lg font-semibold text-gray-900">{account.title}</h3>

							<!-- Stats Grid -->
							<div class="mb-3 grid grid-cols-2 gap-2 text-center text-sm">
								<div>
									<div class="flex items-center justify-center text-gray-400">
										<Users class="mr-1 h-4 w-4" />
										<span>Followers</span>
									</div>
									<div class="font-semibold text-gray-900">
										{formatFollowers(account.follower_count || 0)}
									</div>
								</div>
								<div>
									<div class="flex items-center justify-center text-gray-400">
										<Heart class="mr-1 h-4 w-4" />
										<span>Engagement</span>
									</div>
									<div class="font-semibold text-green-600">
										{account.engagement_rate}%
									</div>
								</div>
							</div>

							<!-- Account Features -->
							<div class="mb-3 space-y-1">
								<div class="flex items-center justify-between text-sm">
									<span class="text-gray-600">Account Age:</span>
									<span class="font-medium text-gray-900">{account.account_age_months} months</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-gray-600">2FA Enabled:</span>
									<span
										class={`font-medium ${account.two_factor_enabled ? 'text-green-600' : 'text-red-500'}`}
									>
										{account.two_factor_enabled ? 'Yes' : 'No'}
									</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-gray-600">Easy Login:</span>
									<span
										class={`font-medium ${account.easy_login_enabled ? 'text-green-600' : 'text-red-500'}`}
									>
										{account.easy_login_enabled ? 'Yes' : 'No'}
									</span>
								</div>
							</div>

							<!-- Price Range Display -->
							<div class="mb-3 rounded-lg bg-blue-50 px-3 py-2">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium text-blue-900">Starting Price</span>
									<span class="text-lg font-bold text-blue-900">
										₦{account.price.toLocaleString()}
									</span>
								</div>
								<div class="text-xs text-blue-700">
									{formatFollowers(account.follower_count)} followers range
								</div>
							</div>

							<!-- Action Buttons -->
							<div class="flex gap-2">
								<button
									class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
									onclick={() => goto(`/product/${account.id}`)}
								>
									View Details
								</button>
								{#if account.images && account.images.length > 0}
									<button
										class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
										onclick={() => {
											previewImages = account.images;
											showImagePreview = true;
										}}
									>
										Preview
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Load More -->
			{#if filteredAccounts.length > 0}
				<div class="mt-12 text-center">
					<button
						class="border-primary text-primary hover:bg-primary rounded-lg border-2 px-8 py-3 font-semibold transition-colors hover:text-white"
					>
						Load More Accounts
					</button>
				</div>
			{/if}
		</div>
	</section>
</main>

<!-- Image Preview Modal -->
<ImagePreviewModal
	images={previewImages}
	isOpen={showImagePreview}
	onClose={() => (showImagePreview = false)}
/>

<Footer />
