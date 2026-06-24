<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { Minus, Plus } from '$lib/icons';
	import { cart } from '$lib/stores/cart.svelte';
	import { showError, showSuccess, showWarning } from '$lib/stores/toasts';
	import { formatPrice } from '$lib/helpers/utils';
	import {
		getBoostingServiceConfig,
		computeBoostingPrice,
		isValidBoostingQuantity,
		getQuantityChips
	} from '$lib/helpers/boosting-service-config';
	import { validateLinkForAction, getRequiredLinkType } from '$lib/helpers/social-link-validator';
	import { getTierDeliveryModeLabel, type TierDeliveryMode } from '$lib/helpers/tier-delivery-config';
	import type { BoostingServiceConfig } from '$lib/helpers/boosting-service-config';

	export interface ReorderBoostingItem {
		categoryId: string;
		productName: string;
		boostQuantity: number;
		targetUrl: string;
	}

	interface Props {
		open: boolean;
		items: ReorderBoostingItem[];
		onClose: () => void;
	}

	let { open, items, onClose }: Props = $props();

	let loading = $state(false);
	let submitting = $state(false);
	let configByCategoryId = $state<Record<string, BoostingServiceConfig | null>>({});
	let linkDrafts = $state<Record<string, string>>({});
	let linkErrors = $state<Record<string, string | null>>({});
	let quantityDrafts = $state<Record<string, number>>({});

	$effect(() => {
		if (!open) return;
		loadConfigs();
	});

	function getQuantity(item: ReorderBoostingItem): number {
		return quantityDrafts[item.categoryId] ?? item.boostQuantity;
	}

	function adjustQuantity(item: ReorderBoostingItem, delta: number) {
		const config = configByCategoryId[item.categoryId];
		if (!config) return;
		const current = getQuantity(item);
		const next = current + delta * config.stepQuantity;
		quantityDrafts[item.categoryId] = Math.max(config.minQuantity, next);
	}

	async function loadConfigs() {
		loading = true;
		linkDrafts = {};
		linkErrors = {};
		quantityDrafts = {};
		for (const item of items) {
			linkDrafts[item.categoryId] = item.targetUrl;
			linkErrors[item.categoryId] = null;
			quantityDrafts[item.categoryId] = item.boostQuantity;
		}

		try {
			const response = await fetch('/api/categories?type=boosting_service&include_inactive=true');
			const result = await response.json();
			const services = (result.data || []) as Array<{ id: string; metadata: unknown }>;
			const byId = new Map(services.map((service) => [service.id, service]));

			const nextConfigs: Record<string, BoostingServiceConfig | null> = {};
			for (const item of items) {
				const service = byId.get(item.categoryId);
				nextConfigs[item.categoryId] = service ? getBoostingServiceConfig(service.metadata) : null;
			}
			configByCategoryId = nextConfigs;
		} catch (error) {
			console.error('Failed to load boosting service details for reorder:', error);
			showError('Could not load service details', 'Please try again.');
		} finally {
			loading = false;
		}
	}

	function handleLinkInput(item: ReorderBoostingItem, value: string) {
		linkDrafts[item.categoryId] = value;
		const config = configByCategoryId[item.categoryId];
		if (!config || !value.trim()) {
			linkErrors[item.categoryId] = null;
			return;
		}
		const result = validateLinkForAction(config.platform, config.actionType, value);
		linkErrors[item.categoryId] = result.valid ? null : result.reason || 'Invalid link';
	}

	function getLinkLabel(config: BoostingServiceConfig | null): string {
		if (!config) return 'link';
		const requiredLinkType = getRequiredLinkType(config.actionType);
		if (requiredLinkType !== 'profile') return 'post/video link';
		return config.platform === 'youtube' ? 'channel link' : 'profile link';
	}

	async function handleConfirm() {
		let hasError = false;
		for (const item of items) {
			const config = configByCategoryId[item.categoryId];
			if (!config) {
				linkErrors[item.categoryId] = 'This service is no longer available.';
				hasError = true;
				continue;
			}
			const value = (linkDrafts[item.categoryId] || '').trim();
			if (!value) {
				linkErrors[item.categoryId] = 'Please enter a link.';
				hasError = true;
				continue;
			}
			const result = validateLinkForAction(config.platform, config.actionType, value);
			if (!result.valid) {
				linkErrors[item.categoryId] = result.reason || 'Invalid link';
				hasError = true;
				continue;
			}
			if (!isValidBoostingQuantity(config, getQuantity(item))) {
				showError('Invalid quantity', `Please choose a valid quantity for ${item.productName}.`);
				hasError = true;
			}
		}

		if (hasError) return;

		submitting = true;
		try {
			let compatibility: { compatible: boolean; existingMode: TierDeliveryMode | null };
			try {
				compatibility = await cart.ensureDeliveryModeCompatibility(
					items[0].categoryId,
					'boosting_manual'
				);
			} catch (error) {
				console.error('Failed to validate cart delivery mode compatibility:', error);
				showError('Could not update cart', 'Please try again.');
				return;
			}

			if (!compatibility.compatible) {
				const existingLabel = compatibility.existingMode
					? getTierDeliveryModeLabel(compatibility.existingMode)
					: getTierDeliveryModeLabel('instant_auto');
				const shouldReplace = window.confirm(
					`You already have ${existingLabel} item(s) in your cart.\n\nBoosting orders must be checked out separately.\n\nPress OK to clear your cart and continue, or Cancel to keep your current cart.`
				);
				if (!shouldReplace) return;
				cart.clear();
				showWarning('Cart cleared', `Previous ${existingLabel} items were removed.`);
			}

			for (const item of items) {
				const value = (linkDrafts[item.categoryId] || '').trim();
				cart.addBoostingService(item.categoryId, value, getQuantity(item));
			}

			showSuccess('Added to cart', 'Redirecting to checkout...');
			onClose();
			goto('/checkout');
		} finally {
			submitting = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<div
				class="fixed inset-0 bg-black/50 transition-opacity"
				tabindex="-1"
				onclick={onClose}
				onkeydown={(e) => e.key === 'Escape' && onClose()}
			></div>

			<div
				class="relative transform overflow-hidden rounded-lg text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
				style="background: var(--bg-elev-1);"
				in:fly={{ y: 200, duration: 300 }}
				out:fade={{ duration: 300 }}
			>
				<div class="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="mb-4">
						<h3 class="text-lg font-semibold" style="color: var(--text);">Order Again</h3>
						<p class="mt-1 text-sm" style="color: var(--text-muted);">
							Confirm or update the link for each service before checkout.
						</p>
					</div>

					{#if loading}
						<p class="py-6 text-center text-sm" style="color: var(--text-muted);">Loading...</p>
					{:else}
						<div class="space-y-4">
							{#each items as item (item.categoryId)}
								{@const config = configByCategoryId[item.categoryId]}
								{@const quantity = getQuantity(item)}
								{@const price = config ? computeBoostingPrice(config, quantity) : NaN}
								<div
									class="rounded-lg border p-3"
									style="border-color: var(--border); background: var(--bg);"
								>
									<p class="text-sm font-semibold" style="color: var(--text);">
										{item.productName}
									</p>

									{#if config}
										<div class="mb-2 flex flex-wrap gap-1.5">
											{#each getQuantityChips(config) as chip}
												<button
													type="button"
													onclick={() => (quantityDrafts[item.categoryId] = chip)}
													class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
													style={quantity === chip
														? 'background: var(--primary); color: #000;'
														: 'background: var(--surface); color: var(--text-muted); border: 1px solid var(--border);'}
												>
													{chip.toLocaleString()}
												</button>
											{/each}
										</div>
										<div class="mb-2 flex items-center justify-between">
											<span class="text-xs font-medium" style="color: var(--text);">Quantity</span>
											<div class="flex items-center gap-2">
												<button
													type="button"
													onclick={() => adjustQuantity(item, -1)}
													disabled={quantity <= config.minQuantity}
													class="flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40"
													style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
													aria-label="Decrease quantity"
												>
													<Minus size={12} />
												</button>
												<span class="min-w-[4rem] text-center text-xs font-semibold" style="color: var(--text);">
													{quantity.toLocaleString()}
												</span>
												<button
													type="button"
													onclick={() => adjustQuantity(item, 1)}
													class="flex h-6 w-6 items-center justify-center rounded-full"
													style="background: var(--surface); color: var(--text); border: 1px solid var(--border);"
													aria-label="Increase quantity"
												>
													<Plus size={12} />
												</button>
											</div>
										</div>
										<p class="mb-2 text-xs" style="color: var(--text-dim);">
											{Number.isNaN(price) ? '' : formatPrice(price)}
										</p>
									{:else}
										<p class="mb-2 text-xs" style="color: var(--text-dim);">
											{item.boostQuantity.toLocaleString()} qty
										</p>
									{/if}

									<label
										for={`reorder-link-${item.categoryId}`}
										class="mb-1 block text-xs font-medium"
										style="color: var(--text);"
									>
										Your {getLinkLabel(config)}
									</label>
									<input
										id={`reorder-link-${item.categoryId}`}
										type="url"
										value={linkDrafts[item.categoryId] || ''}
										oninput={(e) => handleLinkInput(item, (e.target as HTMLInputElement).value)}
										class="block w-full rounded-md px-3 py-2 text-sm"
										style="border: 1px solid var(--border); background: var(--bg-elev-1); color: var(--text);"
									/>
									{#if config}
										<p class="mt-1 text-xs" style="color: var(--text-dim);">
											{getRequiredLinkType(config.actionType) === 'profile'
												? 'Copy this from your browser’s address bar while on your profile.'
												: 'Copy this from your browser’s address bar or the Share button on the post.'}
										</p>
									{/if}
									{#if linkErrors[item.categoryId]}
										<p class="mt-1 text-xs text-red-500">{linkErrors[item.categoryId]}</p>
									{:else if !config}
										<p class="mt-1 text-xs text-red-500">This service is no longer available.</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div
					class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6"
					style="background: var(--surface);"
				>
					<button
						type="button"
						onclick={handleConfirm}
						disabled={loading || submitting}
						class="inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-50 sm:ml-3 sm:w-auto"
						style="background: var(--primary); color: #000;"
					>
						{submitting ? 'Adding...' : 'Continue to Checkout'}
					</button>
					<button
						type="button"
						onclick={onClose}
						class="mt-3 inline-flex w-full justify-center rounded-full px-3 py-2 text-sm font-semibold shadow sm:mt-0 sm:w-auto"
						style="border: 1px solid var(--border); color: var(--text); background: transparent;"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
