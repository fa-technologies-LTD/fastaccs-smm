import { browser } from '$app/environment';
import type { CartItem, CartItemWithTier, CartStorage, CartState } from '$lib/types/cart';
import { normalizeTierDeliveryMode, type TierDeliveryMode } from '$lib/helpers/tier-delivery-config';

interface TierData {
	id: string;
	name: string;
	slug: string;
	metadata: { price?: number | string; pricing?: { base_price?: number | string } } | null;
	isActive: boolean;
	parent?: {
		name: string;
		slug: string;
		metadata?: unknown;
	} | null;
}

interface TierDeliveryLookup {
	id: string;
	metadata: { delivery_mode?: string | null } | null;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeLookupValue(value: string): string {
	return value.trim();
}

function getPlatformIconFromMetadata(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== 'object') {
		return null;
	}

	const icon = (metadata as Record<string, unknown>).icon;
	return typeof icon === 'string' && icon.trim().length > 0 ? icon.trim() : null;
}

const STORAGE_KEY = 'fastaccs_cart';
const STORAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

class CartStore {
	private state = $state<CartState>({
		items: [],
		isOpen: false,
		loading: false,
		error: null
	});

	constructor() {
		if (browser) {
			this.loadFromStorage();
			this.setupStorageListener();
		}
	}

	// Getters
	get items(): CartItem[] {
		return this.state.items;
	}

	get isOpen(): boolean {
		return this.state.isOpen;
	}

	get loading(): boolean {
		return this.state.loading;
	}

	get error(): string | null {
		return this.state.error;
	}

	get itemCount(): number {
		return this.state.items.reduce((sum, item) => sum + item.quantity, 0);
	}

	// Storage management
	private saveToStorage(): void {
		if (!browser) return;

		try {
			const data: CartStorage = {
				items: this.state.items,
				lastUpdated: Date.now()
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (error) {
			console.error('Failed to save cart to storage:', error);
			this.state.error = 'Failed to save cart';
		}
	}

	private loadFromStorage(): void {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (!stored) return;

			const data: CartStorage = JSON.parse(stored);

			// Check if data is expired
			if (Date.now() - data.lastUpdated > STORAGE_EXPIRY) {
				this.clearStorage();
				return;
			}

			// Validate and filter items
			const validItems = data.items.filter(
				(item) =>
					typeof item.tierId === 'string' &&
					item.tierId.trim().length > 0 &&
					typeof item.quantity === 'number' &&
					item.quantity > 0 &&
					typeof item.addedAt === 'number'
			);

			this.state.items = validItems;
		} catch (error) {
			console.error('Failed to load cart from storage:', error);
			this.clearStorage();
		}
	}

	private clearStorage(): void {
		if (!browser) return;
		localStorage.removeItem(STORAGE_KEY);
	}

	private setupStorageListener(): void {
		if (!browser) return;

		window.addEventListener('storage', (event) => {
			if (event.key === STORAGE_KEY) {
				this.loadFromStorage();
			}
		});
	}

	// Cart actions
	addTier(tierId: string, quantity: number = 1): void {
		if (!tierId || quantity <= 0) return;

		const existingIndex = this.state.items.findIndex((item) => item.tierId === tierId);

		if (existingIndex >= 0) {
			this.state.items[existingIndex].quantity += quantity;
		} else {
			this.state.items.push({
				tierId,
				quantity,
				addedAt: Date.now()
			});
		}

		this.state.error = null;
		this.saveToStorage();
	}

	removeTier(tierId: string): void {
		this.state.items = this.state.items.filter((item) => item.tierId !== tierId);
		this.saveToStorage();
	}

	updateQuantity(tierId: string, quantity: number): void {
		if (quantity <= 0) {
			this.removeTier(tierId);
			return;
		}

		const item = this.state.items.find((item) => item.tierId === tierId);
		if (item) {
			item.quantity = quantity;
			this.saveToStorage();
		}
	}

	clear(): void {
		this.state.items = [];
		this.state.error = null;
		this.clearStorage();
	}

	// UI state management
	open(): void {
		this.state.isOpen = true;
	}

	close(): void {
		this.state.isOpen = false;
	}

	toggle(): void {
		this.state.isOpen = !this.state.isOpen;
	}

	// Get items with tier data
	async getItemsWithTiers(): Promise<CartItemWithTier[]> {
		if (this.state.items.length === 0) return [];

		this.state.loading = true;
		this.state.error = null;

		try {
			const tierIds = Array.from(
				new Set(
					this.state.items
						.map((item) => normalizeLookupValue(item.tierId))
						.filter((value) => value.length > 0)
				)
			);

			if (tierIds.length === 0) {
				this.state.items = [];
				this.saveToStorage();
				return [];
			}

			const response = await fetch('/api/categories/tiers/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: tierIds })
			});

			if (!response.ok) {
				if (response.status === 400) {
					this.state.items = [];
					this.saveToStorage();
					this.state.error = 'Your cart was refreshed. Please add items again.';
					return [];
				}
				throw new Error('Failed to fetch tier data');
			}

			const { data: tiers }: { data: TierData[] } = await response.json();
			const tiersById = new Map<string, TierData>();
			const tiersBySlug = new Map<string, TierData>();

			for (const tier of tiers) {
				tiersById.set(tier.id, tier);
				tiersBySlug.set(tier.slug.toLowerCase(), tier);
			}

			// Match items with tier data
			const itemsWithTiers: CartItemWithTier[] = [];
			let didNormalizeIds = false;

			for (const item of this.state.items) {
				const lookupValue = normalizeLookupValue(item.tierId);
				const tier = isUuid(lookupValue)
					? tiersById.get(lookupValue)
					: tiersBySlug.get(lookupValue.toLowerCase()) || tiersById.get(lookupValue);
				if (tier) {
					if (item.tierId !== tier.id) {
						didNormalizeIds = true;
					}

					itemsWithTiers.push({
						...item,
						tierId: tier.id,
						tier: {
							id: tier.id,
							name: tier.name,
							price:
								tier.metadata
									? Number((tier.metadata as any).pricing?.base_price || (tier.metadata as any).price || 0)
									: 0,
							slug: tier.slug,
							platformName: tier.parent?.name || 'Unknown',
							platformSlug: tier.parent?.slug || '',
							platformIcon: getPlatformIconFromMetadata(tier.parent?.metadata),
							isActive: tier.isActive
						}
					});
				}
			}

			// Remove unavailable tiers and normalize legacy slug-based entries to canonical tier IDs.
			if (itemsWithTiers.length !== this.state.items.length || didNormalizeIds) {
				const mergedItems = new Map<string, CartItem>();
				for (const item of itemsWithTiers) {
					const existing = mergedItems.get(item.tierId);
					if (existing) {
						existing.quantity += item.quantity;
						existing.addedAt = Math.min(existing.addedAt, item.addedAt);
						continue;
					}

					mergedItems.set(item.tierId, {
						tierId: item.tierId,
						quantity: item.quantity,
						addedAt: item.addedAt
					});
				}

				this.state.items = Array.from(mergedItems.values());
				this.saveToStorage();
			}

			return itemsWithTiers;
		} catch (error) {
			console.error('Failed to fetch tier data:', error);
			this.state.error = 'Failed to load cart items';
			return [];
		} finally {
			this.state.loading = false;
		}
	}

	// Calculate total
	async getTotal(): Promise<number> {
		const items = await this.getItemsWithTiers();
		return items.reduce((sum, item) => sum + item.tier.price * item.quantity, 0);
	}

	private async fetchTierDeliveryModesById(ids: string[]): Promise<Map<string, TierDeliveryMode>> {
		if (ids.length === 0) return new Map();

		const response = await fetch('/api/categories/tiers/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});

		if (!response.ok) {
			throw new Error('Failed to resolve tier delivery modes');
		}

		const payload = (await response.json()) as { data?: TierDeliveryLookup[] };
		const rows = Array.isArray(payload.data) ? payload.data : [];
		const modeMap = new Map<string, TierDeliveryMode>();

		for (const row of rows) {
			modeMap.set(row.id, normalizeTierDeliveryMode(row.metadata?.delivery_mode));
		}

		return modeMap;
	}

	async ensureDeliveryModeCompatibility(
		targetTierId: string,
		targetMode: TierDeliveryMode
	): Promise<{
		compatible: boolean;
		existingMode: TierDeliveryMode | null;
	}> {
		const existingTierIds = Array.from(
			new Set(
				this.state.items
					.map((item) => normalizeLookupValue(item.tierId))
					.filter((value) => value.length > 0 && value !== targetTierId)
			)
		);

		if (existingTierIds.length === 0) {
			return { compatible: true, existingMode: null };
		}

		const modeMap = await this.fetchTierDeliveryModesById(existingTierIds);
		const existingModes = new Set<TierDeliveryMode>(
			Array.from(modeMap.values()).filter((mode): mode is TierDeliveryMode => Boolean(mode))
		);

		if (existingModes.size === 0) {
			return { compatible: true, existingMode: null };
		}

		const existingMode = existingModes.has('manual_handover') ? 'manual_handover' : 'instant_auto';
		return {
			compatible: existingMode === targetMode,
			existingMode
		};
	}
}

export const cart = new CartStore();
