<script lang="ts">
	import { addToast } from '$lib/stores/toasts';
	import { goto } from '$app/navigation';
	import { getPlatformIcon, isPlatformImageUrl } from '$lib/helpers/platformColors';

	interface PlatformData {
		id: string;
		name: string;
		slug: string;
		description?: string | null;
		metadata?: Record<string, unknown>;
	}

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	let { platforms = [] }: { platforms?: PlatformData[] } = $props();
	let failedPlatformIcons = $state<Record<string, boolean>>({});

	function getPlatformSubLabel(platform: PlatformData): string {
		const text = platform.description?.trim();
		if (text) return text;
		return `${platform.name} accounts`;
	}

	function getPlatformMetadata(platform: PlatformData): PlatformMetadata {
		return (platform.metadata as PlatformMetadata | undefined) || {};
	}

	function shouldRenderCustomIcon(platform: PlatformData, metadata: PlatformMetadata): boolean {
		return isPlatformImageUrl(metadata.icon) && !failedPlatformIcons[platform.id];
	}

	function markPlatformIconFailed(platformId: string) {
		failedPlatformIcons = {
			...failedPlatformIcons,
			[platformId]: true
		};
	}

	function getPlatformIconColor(platform: PlatformData): string {
		const color = (platform.metadata as { color?: unknown } | undefined)?.color;
		if (typeof color === 'string' && color.trim()) {
			return color;
		}

		return 'var(--link)';
	}

	let featuredPlatforms = $derived.by(() =>
		[...platforms]
			.filter((platform) => platform?.slug && platform?.name)
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 4)
	);
</script>

<section style="background: var(--bg); padding: var(--space-4xl) var(--space-md);">
	<div class="mx-auto max-w-6xl">
		<h2
			style="margin-bottom: var(--space-3xl); text-align: center; font-size: 2rem; font-weight: 700; color: var(--text); font-family: var(--font-head);"
		>
			Featured Categories
		</h2>

		<div class="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
			<!-- Social Media Accounts -->
			<div class="category-card flex flex-col overflow-hidden">
				<div
					style="background: var(--btn-primary-gradient); padding: var(--space-lg); color: #04140C;"
				>
					<h3
						style="margin-bottom: var(--space-xs); font-size: 1.25rem; font-weight: 700; font-family: var(--font-head);"
					>
						Social Media Accounts
					</h3>
					<p style="font-size: 0.9rem; opacity: 0.8; font-family: var(--font-body);">
						Curated social media accounts across multiple platforms and audience tiers
					</p>
				</div>

				<div class="flex flex-1 flex-col" style="padding: var(--space-lg);">
					<div class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4">
						{#if featuredPlatforms.length === 0}
							<div
								class="platform-btn col-span-full"
								style="padding: var(--space-lg); text-align: center; color: var(--text-muted);"
							>
								No active platforms available yet.
							</div>
						{:else}
							{#each featuredPlatforms as platform (platform.id)}
								{@const PlatformIcon = getPlatformIcon(platform.slug)}
								{@const platformMeta = getPlatformMetadata(platform)}
								<button
									onclick={() => goto(`/platforms/${platform.slug}`)}
									class="platform-btn flex w-full cursor-pointer items-center"
								>
									{#if shouldRenderCustomIcon(platform, platformMeta)}
										<img
											src={platformMeta.icon as string}
											alt={platform.name}
											class="mr-3 h-6 w-6 rounded sm:h-8 sm:w-8"
											onerror={() => markPlatformIconFailed(platform.id)}
										/>
									{:else}
										<PlatformIcon
											class="mr-3 h-6 w-6 sm:h-8 sm:w-8"
											style={`color: ${getPlatformIconColor(platform)};`}
										/>
									{/if}

									<div class="text-left">
										<div
											style="font-size: 0.95rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
										>
											{platform.name}
										</div>
										<div
											style="font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-body);"
										>
											{getPlatformSubLabel(platform)}
										</div>
									</div>
								</button>
							{/each}
						{/if}
					</div>

					<div class="mt-auto">
						<button
							onclick={() => goto('/platforms')}
							class="btn-primary-cta block w-full cursor-pointer text-center"
						>
							Browse All Accounts
						</button>
					</div>
				</div>
			</div>

			<!-- Growth Services -->
			<div class="category-card flex flex-col overflow-hidden">
				<div
					style="background: var(--btn-secondary-gradient); padding: var(--space-lg); color: var(--text);"
				>
					<h3
						style="margin-bottom: var(--space-xs); font-size: 1.25rem; font-weight: 700; font-family: var(--font-head);"
					>
						Growth Services
					</h3>
					<p style="font-size: 0.9rem; color: var(--text-muted); font-family: var(--font-body);">
						Grow your existing accounts with tailored engagement packages
					</p>
				</div>

				<div class="flex flex-1 flex-col" style="padding: var(--space-lg);">
					<div
						style="margin-bottom: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);"
					>
						<div
							class="platform-btn flex cursor-pointer items-center justify-between"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div
									style="font-size: 0.95rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
								>
									Instagram Followers
								</div>
								<div
									style="font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-body);"
								>
									Followers packages for different growth goals
								</div>
							</div>
						</div>

						<div
							class="platform-btn flex cursor-pointer items-center justify-between"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div
									style="font-size: 0.95rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
								>
									TikTok Views
								</div>
								<div
									style="font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-body);"
								>
									Boost your video reach
								</div>
							</div>
						</div>

						<div
							class="platform-btn flex cursor-pointer items-center justify-between"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div
									style="font-size: 0.95rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
								>
									YouTube Subscribers
								</div>
								<div
									style="font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-body);"
								>
									Grow your channel fast
								</div>
							</div>
						</div>

						<div
							class="platform-btn flex cursor-pointer items-center justify-between"
							role="button"
							tabindex="0"
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							onkeydown={(e) =>
								e.key === 'Enter' && addToast({ title: 'Coming soon', type: 'info' })}
						>
							<div>
								<div
									style="font-size: 0.95rem; font-weight: 600; color: var(--text); font-family: var(--font-body);"
								>
									Facebook Likes
								</div>
								<div
									style="font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-body);"
								>
									Increase post engagement
								</div>
							</div>
						</div>
					</div>

					<div class="mt-auto">
						<button
							onclick={() => addToast({ title: 'Coming soon', type: 'info' })}
							class="btn-secondary-cta block w-full cursor-pointer text-center"
						>
							View All Services
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.category-card {
		background: var(--bg-elev-1);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		transition: all 0.3s ease;
	}

	.category-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-1);
		border-color: var(--primary);
	}

	.platform-btn {
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: var(--r-sm);
		transition: all 0.2s ease;
		padding: var(--space-md);
	}

	.platform-btn:hover {
		background: var(--surface);
		border-color: var(--primary);
		transform: scale(1.02);
	}

	.platform-btn:active {
		transform: scale(0.98);
	}

	.btn-primary-cta {
		background: var(--btn-primary-gradient);
		border: none;
		border-radius: var(--r-sm);
		padding: var(--space-md) var(--space-lg);
		font-family: var(--font-body);
		font-weight: 600;
		color: #04140c;
		transition: all 0.2s ease;
	}

	.btn-primary-cta:hover {
		background: var(--btn-primary-gradient-hover);
		box-shadow: var(--glow-primary);
		transform: translateY(-1px);
	}

	.btn-primary-cta:active {
		transform: scale(0.98);
	}

	.btn-secondary-cta {
		background: transparent;
		border: 2px solid var(--fa-blue-500);
		border-radius: var(--r-sm);
		padding: var(--space-md) var(--space-lg);
		font-family: var(--font-body);
		font-weight: 600;
		color: var(--fa-blue-300);
		transition: all 0.2s ease;
	}

	.btn-secondary-cta:hover {
		background: var(--btn-secondary-gradient);
		border-color: var(--fa-blue-300);
		box-shadow: var(--shadow-1);
	}

	.btn-secondary-cta:active {
		transform: scale(0.98);
	}
</style>
