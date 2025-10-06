import type { Category } from '@prisma/client';
import { browser } from '$app/environment';

export interface CartItem {
	id: string;
	product: Category; // This is actually a tier/category, but keeping 'product' name for compatibility
	quantity: number;
	addedAt: Date;
}

// Cookie cart item formats
interface CookieCartItemNew {
	id: string;
	productId: string;
	productName: string;
	quantity: number;
	addedAt: string;
}

interface CookieCartItemOld {
	id: string;
	product: Category;
	quantity: number;
	addedAt: string;
}

interface CartState {
	items: CartItem[];
	isOpen: boolean;
	loading: boolean;
}

class CartStore {
	private state = $state<CartState>({
		items: [],
		isOpen: false,
		loading: false
	});

	constructor() {
		// Load cart from cookies on initialization
		if (browser) {
			this.loadFromCookies().catch((error) => {
				console.error('Failed to load cart from cookies:', error);
			});
		}
	}

	// Getters
	get items() {
		return this.state.items;
	}

	get isOpen() {
		return this.state.isOpen;
	}

	get loading() {
		return this.state.loading;
	}

	get total() {
		return this.state.items.reduce((sum, item) => {
			// Get price from tier metadata or default to 0
			const price =
				typeof item.product.metadata === 'object' &&
				item.product.metadata !== null &&
				'price' in item.product.metadata
					? Number(item.product.metadata.price)
					: 0;
			return sum + price * item.quantity;
		}, 0);
	}

	get itemCount() {
		return this.state.items.reduce((sum, item) => sum + item.quantity, 0);
	}

	// Cookie management
	private saveToCookies() {
		if (!browser) return;

		// ✅ FIXED: Store only essential data to avoid 4KB cookie limit
		const cartData = {
			items: this.state.items.map((item) => ({
				id: item.id,
				productId: item.product.id, // Only store ID, not full Category object
				productName: item.product.name, // Store name for display
				quantity: item.quantity,
				addedAt: item.addedAt.toISOString()
			}))
		};

		// Set cookie to expire in 24 hours
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

		document.cookie = `fastaccs_cart=${encodeURIComponent(JSON.stringify(cartData))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
	}

	private async loadFromCookies() {
		if (!browser) return;

		const cookies = document.cookie.split(';');
		const cartCookie = cookies.find((cookie) => cookie.trim().startsWith('fastaccs_cart='));

		if (cartCookie) {
			try {
				const cartData = JSON.parse(decodeURIComponent(cartCookie.split('=')[1]));

				// ✅ FIXED: Added validation to prevent corruption issues
				if (!cartData || !Array.isArray(cartData.items)) {
					console.warn('Invalid cart data format in cookie');
					this.clearCookies();
					return;
				}

				// ✅ FIXED: Handle both old format (full product) and new format (productId only)
				const validItems = cartData.items.filter((item: unknown) => {
					if (!item || typeof item !== 'object') return false;

					// New format with productId
					if ('productId' in item && 'productName' in item) {
						return (
							'id' in item &&
							typeof item.id === 'string' &&
							typeof item.productId === 'string' &&
							typeof item.productName === 'string' &&
							'quantity' in item &&
							typeof item.quantity === 'number' &&
							item.quantity > 0 &&
							'addedAt' in item &&
							typeof item.addedAt === 'string'
						);
					}

					// Old format with full product object (backward compatibility)
					return (
						'id' in item &&
						typeof item.id === 'string' &&
						'product' in item &&
						item.product &&
						typeof item.product === 'object' &&
						'id' in item.product &&
						typeof item.product.id === 'string' &&
						'name' in item.product &&
						typeof item.product.name === 'string' &&
						'quantity' in item &&
						typeof item.quantity === 'number' &&
						item.quantity > 0 &&
						'addedAt' in item &&
						typeof item.addedAt === 'string'
					);
				});

				// ✅ FIXED: Load cart items and fetch full category data for new format
				this.state.items = await Promise.all(
					validItems.map(async (item: unknown) => {
						let product;

						// Type assertion for validated items
						const typedItem = item as CookieCartItemNew | CookieCartItemOld;

						// New format - need to fetch category data
						if ('productId' in typedItem && 'productName' in typedItem) {
							try {
								const response = await fetch(`/api/categories/${typedItem.productId}`);
								if (response.ok) {
									const categoryData = await response.json();
									product = categoryData.data;
								} else {
									// Fallback if API fails - create minimal product object
									product = {
										id: typedItem.productId,
										name: typedItem.productName,
										metadata: {},
										slug: '',
										description: null,
										categoryType: 'tier',
										parentId: null,
										sortOrder: 0,
										isActive: true,
										createdAt: new Date(),
										updatedAt: new Date()
									};
								}
							} catch (error) {
								console.warn('Failed to fetch category data:', error);
								// Create minimal product object as fallback
								product = {
									id: typedItem.productId,
									name: typedItem.productName,
									metadata: {},
									slug: '',
									description: null,
									categoryType: 'tier',
									parentId: null,
									sortOrder: 0,
									isActive: true,
									createdAt: new Date(),
									updatedAt: new Date()
								};
							}
						} else {
							// Old format - use existing product data
							product = typedItem.product;
						}

						return {
							id: typedItem.id,
							product,
							quantity: typedItem.quantity,
							addedAt: new Date(typedItem.addedAt)
						};
					})
				);

				// ✅ FIXED: Save cleaned data back to cookie if items were filtered
				if (validItems.length !== cartData.items.length) {
					this.saveToCookies();
				}
			} catch (error) {
				console.error('Failed to load cart from cookies:', error);
				this.clearCookies(); // Clear corrupted cookie
			}
		}
	}

	private clearCookies() {
		if (!browser) return;
		document.cookie = 'fastaccs_cart=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
	}

	// Actions
	addItem(product: Category, quantity: number = 1) {
		const existingIndex = this.state.items.findIndex((item) => item.id === product.id);

		if (existingIndex >= 0) {
			// Update existing item
			this.state.items[existingIndex].quantity += quantity;
		} else {
			// Add new item
			this.state.items.push({
				id: product.id,
				product,
				quantity,
				addedAt: new Date()
			});
		}

		this.saveToCookies();
	}

	removeItem(productId: string) {
		this.state.items = this.state.items.filter((item) => item.id !== productId);
		this.saveToCookies();
	}

	updateQuantity(productId: string, quantity: number) {
		if (quantity <= 0) {
			this.removeItem(productId);
			return;
		}

		const item = this.state.items.find((item) => item.id === productId);
		if (item) {
			item.quantity = quantity;
			this.saveToCookies();
		}
	}

	clear() {
		this.state.items = [];
		this.clearCookies();
	}

	toggle() {
		this.state.isOpen = !this.state.isOpen;
	}

	open() {
		this.state.isOpen = true;
	}

	close() {
		this.state.isOpen = false;
	}

	// Utility methods
	cleanupExpired() {
		// For now, just a placeholder
		// TODO: Implement reservation expiry logic if needed
	}

	setLoading(loading: boolean) {
		this.state.loading = loading;
	}
}

// Export singleton instance
export const cart = new CartStore();
