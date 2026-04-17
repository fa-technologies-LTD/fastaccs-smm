<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowRight, MessageCircle } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { getPlatformIcon, isPlatformImageUrl } from '$lib/helpers/platformColors';
	import { formatPrice } from '$lib/helpers/utils';

	interface PlatformData {
		id: string;
		name: string;
		slug: string;
		description?: string | null;
		metadata?: Record<string, unknown>;
		tierCount: number;
		totalAccounts: number;
		minPrice: number | null;
	}

	interface PlatformMetadata {
		icon?: unknown;
		color?: unknown;
	}

	let { platforms = [] }: { platforms?: PlatformData[] } = $props();
	let failedPlatformIcons = $state<Record<string, boolean>>({});
	let launchCardShake = $state(false);
	let launchCardShakeTimer: ReturnType<typeof setTimeout> | null = null;

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

	function getPriceLabel(platform: PlatformData): string {
		if (!platform.minPrice || platform.minPrice <= 0) {
			return 'Pricing updates soon';
		}

		return `From ${formatPrice(platform.minPrice)}`;
	}

	let featuredPlatforms = $derived.by(() =>
		[...platforms]
			.filter((platform) => platform?.slug && platform?.name)
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 4)
	);

	function triggerLaunchCardAttention() {
		launchCardShake = false;
		if (launchCardShakeTimer) {
			clearTimeout(launchCardShakeTimer);
			launchCardShakeTimer = null;
		}

		requestAnimationFrame(() => {
			launchCardShake = true;
			launchCardShakeTimer = setTimeout(() => {
				launchCardShake = false;
				launchCardShakeTimer = null;
			}, 520);
		});
	}

	onDestroy(() => {
		if (launchCardShakeTimer) {
			clearTimeout(launchCardShakeTimer);
		}
	});
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
										class={`platform-btn platform-entry flex w-full cursor-pointer items-start ${
											platform.totalAccounts > 0 ? 'clickable' : ''
										}`}
									>
										{#if shouldRenderCustomIcon(platform, platformMeta)}
											<img
												src={platformMeta.icon as string}
												alt={platform.name}
												class="mr-3 mt-0.5 h-6 w-6 rounded sm:h-8 sm:w-8"
												onerror={() => markPlatformIconFailed(platform.id)}
											/>
										{:else}
											<PlatformIcon
												class="mr-3 mt-0.5 h-6 w-6 sm:h-8 sm:w-8"
												style={`color: ${getPlatformIconColor(platform)};`}
											/>
										{/if}

										<div class="min-w-0 flex-1 text-left">
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
											<div
												style="font-size: 1.1rem; font-weight: 700; color: var(--primary); font-family: var(--font-head); margin-top: 8px;"
											>
												{getPriceLabel(platform)}
											</div>
										</div>
										{#if platform.totalAccounts > 0}
											<span class="hover-arrow">
												<ArrowRight size={16} />
											</span>
										{/if}
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
						<div class="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4">
							<div class="growth-preview-list">
								<button class="platform-btn growth-service-btn" type="button" onclick={triggerLaunchCardAttention}>
									Instagram Followers
								</button>
								<button class="platform-btn growth-service-btn" type="button" onclick={triggerLaunchCardAttention}>
									TikTok Views
								</button>
								<button class="platform-btn growth-service-btn" type="button" onclick={triggerLaunchCardAttention}>
									YouTube Subscribers
								</button>
								<button class="platform-btn growth-service-btn" type="button" onclick={triggerLaunchCardAttention}>
									Facebook Likes
								</button>
							</div>
							<div class={`growth-callout ${launchCardShake ? 'shake-attention' : ''}`}>
								<p
									class="text-sm font-semibold uppercase"
									style="letter-spacing: 0.06em; color: var(--primary); font-family: var(--font-head);"
								>
									Launching soon
								</p>
								<p
									class="mt-2"
									style="font-size: 0.95rem; font-weight: 500; color: var(--text); line-height: 1.45; font-family: var(--font-body);"
								>
									This section is under construction. Need a custom growth service package right now?
								</p>
								<a
									href="https://wa.link/fast_accounts"
									target="_blank"
									rel="noopener noreferrer"
									class="chat-btn mt-4"
								>
									<MessageCircle size={16} />
									<span>Chat now on WhatsApp</span>
								</a>
							</div>
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

		.platform-entry {
			position: relative;
		}

		.platform-entry.clickable:hover {
			border-color: var(--primary);
		}

		.hover-arrow {
			position: absolute;
			right: 12px;
			bottom: 12px;
			opacity: 0;
			color: var(--text-dim);
			transition: opacity 180ms ease;
		}

		.platform-entry.clickable:hover .hover-arrow {
			opacity: 1;
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

		.growth-preview-list {
			display: flex;
			flex-direction: column;
			gap: var(--space-md);
		}

		.growth-service-btn {
			width: 100%;
			text-align: left;
			color: var(--text);
			font-family: var(--font-body);
			font-size: 1.05rem;
			font-weight: 600;
			cursor: pointer;
		}

		.growth-callout {
			display: flex;
			flex-direction: column;
			align-self: start;
			min-width: 0;
			width: 100%;
			border-radius: var(--r-sm);
			border: 1px solid rgba(5, 212, 113, 0.35);
			background: rgba(7, 9, 12, 0.55);
			padding: var(--space-md);
		}

		.shake-attention {
			animation: launch-shake 520ms ease-in-out;
		}

		.chat-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			width: 100%;
			border-radius: var(--r-sm);
			padding: 0.65rem 1rem;
			border: 1px solid rgba(5, 212, 113, 0.35);
			background: rgba(5, 212, 113, 0.12);
			color: var(--primary);
			font-family: var(--font-body);
			font-size: 0.88rem;
			font-weight: 600;
			text-decoration: none;
			text-align: center;
			line-height: 1.25;
			transition: transform 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
			flex-wrap: wrap;
			max-width: 100%;
			min-width: 0;
			word-break: break-word;
		}

		.chat-btn:hover {
			border-color: rgba(5, 212, 113, 0.5);
			transform: translateY(-1px);
		}

		.chat-btn:active {
			transform: scale(0.98);
		}

		@keyframes launch-shake {
			0% {
				transform: translateX(0);
			}
			20% {
				transform: translateX(-5px);
			}
			40% {
				transform: translateX(4px);
			}
			60% {
				transform: translateX(-3px);
			}
			80% {
				transform: translateX(2px);
			}
			100% {
				transform: translateX(0);
			}
		}

		@media (prefers-reduced-motion: reduce) {
			.shake-attention {
				animation: none;
			}
		}

	</style>
