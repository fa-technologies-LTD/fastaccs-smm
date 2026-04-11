<script lang="ts">
	import { goto } from '$app/navigation';
	import { ShoppingCart, Star, Users, Package, ArrowRight, ChevronRight } from '@lucide/svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	
	import type { PageData } from './$types';
	import {
		getPlatformColor,
		getPlatformIcon,
		isPlatformImageUrl
	} from '$lib/helpers/platformColors';
	import { formatPrice } from '$lib/helpers/utils';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let platformHeaderIconFailed = $state(false);

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	// Format follower count
	function formatFollowers(count: number): string {
		if (count >= 1000000) {
			const millions = count / 1000000;
			return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
		} else if (count >= 1000) {
			const thousands = count / 1000;
			return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
		}
		return count.toString();
	}

	function navigateToTier(tierSlug: string) {
		goto(`/platforms/${data.platform?.slug}/tiers/${tierSlug}`);
	}

	function goBack() {
		goto('/platforms');
	}

	function getPlatformHeaderStyle(metadata: PlatformMetadata | undefined): string | undefined {
		const color = typeof metadata?.color === 'string' ? metadata.color.trim() : '';
		if (!color) return undefined;

		return `background: linear-gradient(135deg, ${color} 0%, rgba(15, 22, 47, 0.88) 100%);`;
	}

	function getPlatformMetadata(metadata: Record<string, unknown> | undefined): PlatformMetadata {
		return (metadata as PlatformMetadata | undefined) || {};
	}

	function shouldRenderPlatformHeaderImage(metadata: PlatformMetadata): boolean {
		return isPlatformImageUrl(metadata.icon) && !platformHeaderIconFailed;
	}

	// Get tier status based on availability
	function getTierStatus(available: number): { status: string; color: string; bgColor: string } {
		if (available === 0) {
			return { status: 'Sold Out', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
		} else if (available <= 10) {
			return {
				status: 'Few Left',
				color: 'text-yellow-600',
				bgColor: 'bg-yellow-50 border-yellow-200'
			};
		} else {
			return {
				status: 'In Stock',
				color: 'text-green-600',
				bgColor: 'bg-green-50 border-green-200'
			};
		}
	}

	// Format feature names (e.g., "viral_ready" -> "Viral Ready")
	function formatFeatureName(feature: string): string {
		return feature
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	function getTierAudienceLabel(metadata: unknown): string {
		if (!metadata || typeof metadata !== 'object') {
			return 'Tier details available on selection';
		}

		const tierMetadata = metadata as Record<string, unknown>;
		const followerRange = tierMetadata.follower_range;

		if (followerRange && typeof followerRange === 'object') {
			const range = followerRange as Record<string, unknown>;
			const display =
				typeof range.display === 'string' && range.display.trim().length > 0
					? range.display.trim()
					: '';

			if (display) {
				return /follower/i.test(display) ? display : `${display} followers`;
			}

			const min = typeof range.min === 'number' ? range.min : undefined;
			const max = typeof range.max === 'number' ? range.max : undefined;

			if (min !== undefined && max !== undefined) {
				return `${formatFollowers(min)} - ${formatFollowers(max)} followers`;
			}
		}

		const followerCount =
			typeof tierMetadata.follower_count === 'number' ? tierMetadata.follower_count : undefined;
		if (followerCount !== undefined && followerCount > 0) {
			return `${formatFollowers(followerCount)} followers`;
		}

		return 'Tier details available on selection';
	}

	// Get tier features based on metadata
	function getTierFeatures(metadata: any): string[] {
		// First check for admin-defined features
		if (metadata?.features && Array.isArray(metadata.features)) {
			return metadata.features
				.filter((feature: string) => feature && feature.trim() !== '')
				.map(formatFeatureName);
		}

		// Fallback to legacy features
		const features: string[] = [];
		if (metadata?.typical_features) {
			features.push(...metadata.typical_features.map(formatFeatureName));
		}
		if (metadata?.age_hint) {
			features.push(formatFeatureName(metadata.age_hint));
		}
		return features;
	}
</script>

<svelte:head>
	<title>{data.platform?.name} Accounts - FastAccs</title>
	<meta
		name="description"
		content="Browse available {data.platform
			?.name} account tiers and complete checkout securely on FastAccs."
	/>
</svelte:head>

<Navigation />

<main class="min-h-screen" style="background: var(--bg-elev-1);">
	{#if !data.platform}
		<!-- Platform not found -->
		<section class="py-16">
			<div class="mx-auto max-w-4xl px-4 text-center">
				<Package class="mx-auto mb-4 h-16 w-16" style="color: var(--text-muted);" />
				<h1 class="mb-4 text-3xl font-bold" style="color: var(--text);">Platform Not Found</h1>
				<p class="mb-8 text-lg" style="color: var(--text-muted);">
					The platform you're looking for doesn't exist or isn't available right now.
				</p>
				<button
					onclick={goBack}
					class="rounded-lg px-6 py-3 font-semibold transition-all active:scale-95"
					style="background: var(--btn-primary-gradient); color: white;"
				>
					Back to Platforms
				</button>
			</div>
		</section>
	{:else}
		{@const PlatformIcon = getPlatformIcon(data.platform.slug)}
		{@const platformMeta = getPlatformMetadata(data.platform.metadata)}

			<!-- Platform Header -->
			<section
				class={`py-4 text-white sm:py-12 ${platformMeta?.color ? '' : `bg-gradient-to-r ${getPlatformColor(data.platform.slug)}`}`}
				style={getPlatformHeaderStyle(platformMeta)}
			>
			<div class="mx-auto max-w-6xl px-4">
				<!-- Enhanced Breadcrumb Navigation -->
				<Breadcrumb
					items={[
						{ label: 'Platforms', href: '/platforms' },
						{ label: data.platform.name, active: true }
					]}
				/>

				<!-- Step Indicator - Commented Out -->
				<!-- <StepIndicator currentStep={2} /> -->

				<div class="flex items-start gap-4 sm:gap-6">
					<div class="flex flex-col items-center gap-3">
						<div class="rounded-full bg-white/20 p-3 sm:p-4">
							{#if shouldRenderPlatformHeaderImage(platformMeta)}
								<img
									src={platformMeta.icon as string}
									alt={data.platform.name}
									class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12"
									onerror={() => (platformHeaderIconFailed = true)}
								/>
							{:else}
								<PlatformIcon class="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12" />
							{/if}
						</div>
							<div class="text-center">
								<div class="text-2xl font-bold sm:text-3xl">{data.tiers.length}</div>
								<div class="text-xs opacity-75 sm:text-sm">Available Tiers</div>
							</div>
						</div>
						<div class="flex-1">
						<h1 class="mb-1 text-2xl font-bold sm:text-3xl md:text-4xl">
							{data.platform.name} Accounts
						</h1>
						<p class="text-sm opacity-90 sm:text-base md:text-lg">{data.platform.description}</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Tier Selection -->
		<section class="py-8 sm:py-16">
			<div class="mx-auto max-w-6xl px-4">
					<div class="mb-8 text-center">
						<h2 class="mb-4 text-2xl font-bold sm:text-3xl" style="color: var(--text);">
							Available Tiers
						</h2>
						<p class="text-base sm:text-lg" style="color: var(--text-muted);">
							Select the tier that matches your needs. Each tier shows current stock and pricing.
						</p>
					</div>

				{#if data.tiers.length === 0}
					<div class="rounded-lg p-8 text-center" style="background: var(--bg-elev-2);">
						<Package class="mx-auto mb-4 h-12 w-12" style="color: var(--text-muted);" />
						<h3 class="mb-2 text-lg font-semibold" style="color: var(--text);">
							No Tiers Available
						</h3>
						<p style="color: var(--text-muted);">
							We're currently restocking {data.platform.name} accounts. Please check back soon!
						</p>
						<button
							onclick={goBack}
							class="mt-4 rounded-lg px-6 py-2 transition-all active:scale-95"
							style="background: var(--btn-primary-gradient); color: white;"
						>
							Browse Other Platforms
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
						{#each data.tiers as tier}
							{@const tierStatus = getTierStatus(tier.visible_available)}
							{@const tierFeatures = getTierFeatures(tier.metadata)}
							<div
								onclick={() => tier.visible_available > 0 && navigateToTier(tier.tier_slug)}
								onkeydown={(e) =>
									e.key === 'Enter' && tier.visible_available > 0 && navigateToTier(tier.tier_slug)}
								role="button"
								tabindex={tier.visible_available > 0 ? 0 : -1}
								class="group relative flex flex-col overflow-hidden rounded-xl shadow transition-all duration-300 {tier.visible_available >
								0
									? 'cursor-pointer hover:-translate-y-1 hover:shadow-md active:scale-[.98]'
									: 'cursor-not-allowed opacity-75'}"
								style="background: var(--bg-elev-2); border: 1px solid var(--border);"
							>
								<!-- Stock Status Badge -->
								<div class="absolute top-32 right-3 z-10">
									<span
										class="rounded-full px-2 py-1 text-xs font-medium"
										style={tierStatus.status === 'In Stock'
											? 'background: rgba(34, 197, 94, 0.2); color: rgb(34, 197, 94); border: 1px solid rgba(34, 197, 94, 0.3);'
											: tierStatus.status === 'Few Left'
												? 'background: rgba(234, 179, 8, 0.2); color: rgb(234, 179, 8); border: 1px solid rgba(234, 179, 8, 0.3);'
												: 'background: rgba(239, 68, 68, 0.2); color: rgb(239, 68, 68); border: 1px solid rgba(239, 68, 68, 0.3);'}
									>
										{tierStatus.status}
									</span>
								</div>

								<!-- Tier Header -->
								<div class="flex flex-1 flex-col p-6">
									<div class="mb-4 flex items-center justify-between">
										<div>
												<h3 class="text-xl font-bold" style="color: var(--text);">
													{tier.tier_name}
												</h3>
												<p class="text-sm" style="color: var(--text-muted);">
													{getTierAudienceLabel(tier.metadata)}
												</p>
											</div>
										<div class="text-right">
											<div
												class="text-2xl font-bold"
												style="background: var(--btn-primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
											>
												{formatPrice(tier.price)}
											</div>
											<div class="text-sm" style="color: var(--text-muted);">per account</div>
										</div>
									</div>

									<!-- Tier Description -->
									{#if tier.description}
										<div class="mb-4">
											<p class="text-sm leading-relaxed" style="color: var(--text-muted);">
												{tier.description}
											</p>
										</div>
									{/if}

									<!-- Availability -->
									<div class="mb-4 text-sm" style="color: var(--text-muted);">
										<span class="font-medium">{tier.visible_available}</span> accounts available
										{#if tier.reservations_active > 0}
											<span class="text-yellow-600">
												• {tier.reservations_active} reserved
											</span>
										{/if}
									</div>

									<!-- Tier Features -->
									{#if tierFeatures.length > 0}
										<div class="mb-6">
											<h4 class="mb-3 text-sm font-semibold" style="color: var(--text);">
												Tier Features:
											</h4>
											<div class="space-y-2">
												{#each tierFeatures as feature}
													<div
														class="flex items-start gap-2 text-sm"
														style="color: var(--text-muted);"
													>
														<Star class="mt-0.5 h-3 w-3 flex-shrink-0 text-green-500" />
														<span>{formatFeatureName(feature)}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Age Hint -->
									{#if tier.metadata?.age_hint}
										<div
											class="mb-4 rounded-lg p-3"
											style="background: var(--bg-elev-1); border: 1px solid var(--border);"
										>
											<div
												class="flex items-center gap-2 text-sm"
												style="color: var(--text-muted);"
											>
												<Users class="h-4 w-4" />
												<span class="font-medium">Account Age:</span>
												<span>{tier.metadata.age_hint}</span>
											</div>
										</div>
									{/if}
								</div>

								<!-- Action Label - Always at Bottom -->
								<div
									class="mx-6 mt-6 mb-6 flex items-center justify-center gap-2 rounded-lg py-3 text-center font-semibold transition-colors"
									style={tier.visible_available === 0
										? 'background: var(--bg-elev-1); color: var(--text-muted); border: 1px solid var(--border);'
										: 'background: var(--btn-primary-gradient); color: white;'}
								>
									{#if tier.visible_available === 0}
										Sold Out
									{:else}
										<span>Select This Tier</span>
										<ArrowRight class="h-4 w-4" />
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		
		
	{/if}
</main>

<Footer />
