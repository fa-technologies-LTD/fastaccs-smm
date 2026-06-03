import { browser } from '$app/environment';
import type { CartItem, CartItemWithTier, CartStorage, CartState } from '$lib/types/cart';
import {
	normalizeTierDeliveryMode,
	type TierDeliveryMode
} from '$lib/helpers/tier-delivery-config';

interface TierDeliveryLookup {
	id: string;
	metadata: { delivery_mode?: string | null } | null;
}

function normalizeLookupValue(value: string): string {
	return value.trim();
}

const STORAGE_KEY = 'fastaccs_cart';
const STORAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function getCartItemId(item: Pick<CartItem, 'tierId' | 'exactAccount'>): string {
	return item.exactAccount ? `exact:${item.exactAccount.accountId}` : `tier:${item.tierId}`;
}

class CartStore {
	private state = $state<CartState>({
		items: [],
		isOpen: false,
		loading: false,
		error: null,
		notice: null
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

	get notice(): string | null {
		return this.state.notice;
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
			this.state.notice = null;
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
			const validItems = data.items
				.filter(
					(item) =>
						typeof item.tierId === 'string' &&
						item.tierId.trim().length > 0 &&
						typeof item.quantity === 'number' &&
						item.quantity > 0 &&
						typeof item.addedAt === 'number' &&
						(!item.exactAccount ||
							(typeof item.exactAccount.accountId === 'string' &&
								typeof item.exactAccount.displayLabel === 'string' &&
								typeof item.exactAccount.profileUrl === 'string' &&
								typeof item.exactAccount.reservedUntil === 'string' &&
								(item.exactAccount.screenshotUrl == null ||
									typeof item.exactAccount.screenshotUrl === 'string')))
				)
				.map((item) => ({
					...item,
					cartItemId: item.cartItemId || getCartItemId(item),
					quantity: item.exactAccount ? 1 : item.quantity
				}));

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

		const existingIndex = this.state.items.findIndex(
			(item) => item.tierId === tierId && !item.exactAccount
		);

		if (existingIndex >= 0) {
			this.state.items[existingIndex].quantity += quantity;
		} else {
			this.state.items.push({
				cartItemId: `tier:${tierId}`,
				tierId,
				quantity,
				addedAt: Date.now()
			});
		}

		this.state.error = null;
		this.state.notice = null;
		this.saveToStorage();
	}

	addExactTier(
		tierId: string,
		exactAccount: {
			accountId: string;
			displayLabel: string;
			profileUrl: string;
			screenshotUrl?: string | null;
			reservedUntil: string;
		}
	): void {
		if (!tierId || !exactAccount.accountId) return;

		const cartItemId = `exact:${exactAccount.accountId}`;
		const existingIndex = this.state.items.findIndex((item) => item.cartItemId === cartItemId);
		const nextItem: CartItem = {
			cartItemId,
			tierId,
			quantity: 1,
			addedAt: Date.now(),
			exactAccount
		};

		if (existingIndex >= 0) {
			this.state.items[existingIndex] = nextItem;
		} else {
			this.state.items.push(nextItem);
		}

		this.state.error = null;
		this.state.notice = null;
		this.saveToStorage();
	}

	removeTier(tierId: string): void {
		this.state.items = this.state.items.filter((item) => item.tierId !== tierId);
		this.saveToStorage();
	}

	removeItem(cartItemId: string): void {
		this.state.items = this.state.items.filter(
			(item) => (item.cartItemId || getCartItemId(item)) !== cartItemId
		);
		this.saveToStorage();
	}

	updateQuantity(tierId: string, quantity: number): void {
		if (quantity <= 0) {
			this.removeTier(tierId);
			return;
		}

		const item = this.state.items.find((item) => item.tierId === tierId && !item.exactAccount);
		if (item) {
			if (item.exactAccount) {
				item.quantity = 1;
				this.saveToStorage();
				return;
			}
			item.quantity = quantity;
			this.saveToStorage();
		}
	}

	clear(): void {
		this.state.items = [];
		this.state.error = null;
		this.state.notice = null;
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
		this.state.notice = null;

		try {
			const response = await fetch('/api/cart/refresh', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: this.state.items })
			});

			if (!response.ok) {
				throw new Error('Failed to refresh cart');
			}

			const result = (await response.json()) as {
				success?: boolean;
				data?: {
					items?: CartItemWithTier[];
					messages?: string[];
				};
				error?: string;
			};

			if (!result.success) {
				throw new Error(result.error || 'Failed to refresh cart');
			}

			const itemsWithTiers = Array.isArray(result.data?.items) ? result.data.items : [];
			this.state.items = itemsWithTiers.map((item) => ({
				cartItemId: item.cartItemId || getCartItemId(item),
				tierId: item.tierId,
				quantity: item.exactAccount ? 1 : item.quantity,
				addedAt: item.addedAt,
				exactAccount: item.exactAccount
			}));
			this.saveToStorage();

			const messages = Array.isArray(result.data?.messages) ? result.data.messages : [];
			this.state.notice = messages.length ? messages.join(' ') : null;

			return itemsWithTiers;
		} catch (error) {
			console.error('Failed to refresh cart:', error);
			this.state.error = 'Failed to load cart items';
			this.state.notice = null;
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
		return new Map(
			rows.map((row) => [row.id, normalizeTierDeliveryMode(row.metadata?.delivery_mode)])
		);
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
