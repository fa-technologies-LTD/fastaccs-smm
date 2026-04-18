import { browser } from '$app/environment';
import type { CartItem, CartItemWithTier, CartStorage, CartState } from '$lib/types/cart';

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
					item.tierId &&
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
			const tierIds = this.state.items.map((item) => item.tierId);
			const response = await fetch('/api/categories/tiers/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: tierIds })
			});

			if (!response.ok) {
				throw new Error('Failed to fetch tier data');
			}

			const { data: tiers }: { data: TierData[] } = await response.json();

			// Match items with tier data
			const itemsWithTiers: CartItemWithTier[] = [];

			for (const item of this.state.items) {
				const tier = tiers.find((t: TierData) => t.id === item.tierId);
				if (tier) {
					itemsWithTiers.push({
						...item,
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

			// Remove items for deleted/inactive tiers
			if (itemsWithTiers.length !== this.state.items.length) {
				this.state.items = itemsWithTiers.map((item) => ({
					tierId: item.tierId,
					quantity: item.quantity,
					addedAt: item.addedAt
				}));
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
}

export const cart = new CartStore();
