import type { Tables } from '$lib/supabase';
import { SvelteDate } from 'svelte/reactivity';
import { browser } from '$app/environment';

export interface CartItem {
	id: string;
	product: Tables<'products'>;
	quantity: number;
	addedAt: SvelteDate;
}

// Load initial state from localStorage if available
function loadCartFromStorage(): CartItem[] {
	if (!browser) return [];

	try {
		const stored = localStorage.getItem('fastaccs-cart');
		if (stored) {
			const parsed = JSON.parse(stored);
			// Convert stored date strings back to SvelteDate objects
			return parsed.map(
				(item: { id: string; product: Tables<'products'>; quantity: number; addedAt: string }) => ({
					...item,
					addedAt: new SvelteDate(item.addedAt)
				})
			);
		}
	} catch (error) {
		console.error('Error loading cart from storage:', error);
	}
	return [];
}

// Save cart to localStorage
function saveCartToStorage(items: CartItem[]) {
	if (!browser) return;

	try {
		// Convert SvelteDate objects to ISO strings for storage
		const toStore = items.map((item) => ({
			...item,
			addedAt: item.addedAt.toISOString()
		}));
		localStorage.setItem('fastaccs-cart', JSON.stringify(toStore));
	} catch (error) {
		console.error('Error saving cart to storage:', error);
	}
}

// Create shared state using Svelte 5 runes - the proper way!
const initialItems = loadCartFromStorage();
export const cartState = $state({
	items: initialItems,
	total: initialItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
	isOpen: false,
	loading: false
});

// Utility functions to manipulate the state
export const cart = {
	addItem: (product: Tables<'products'>, quantity: number = 1) => {
		console.log('Adding item to cart:', product.title, 'quantity:', quantity);
		const existingIndex = cartState.items.findIndex((item) => item.id === product.id);

		if (existingIndex >= 0) {
			cartState.items[existingIndex].quantity += quantity;
		} else {
			cartState.items.push({
				id: product.id,
				product,
				quantity,
				addedAt: new SvelteDate()
			});
		}

		cartState.total = cartState.items.reduce(
			(sum, item) => sum + item.product.price * item.quantity,
			0
		);

		// Save to localStorage
		saveCartToStorage(cartState.items);

		console.log(
			'Cart state updated. Total items:',
			cartState.items.length,
			'Total cost:',
			cartState.total
		);
	},

	removeItem: (productId: string) => {
		console.log('Removing item from cart:', productId);
		cartState.items = cartState.items.filter((item) => item.id !== productId);
		cartState.total = cartState.items.reduce(
			(sum, item) => sum + item.product.price * item.quantity,
			0
		);

		// Save to localStorage
		saveCartToStorage(cartState.items);

		console.log('Item removed. Remaining items:', cartState.items.length);
	},

	updateQuantity: (productId: string, quantity: number) => {
		console.log('Updating quantity for product:', productId, 'to:', quantity);
		const item = cartState.items.find((item) => item.id === productId);
		if (item) {
			item.quantity = Math.max(1, quantity);
			cartState.total = cartState.items.reduce(
				(sum, item) => sum + item.product.price * item.quantity,
				0
			);
		}

		// Save to localStorage
		saveCartToStorage(cartState.items);

		console.log('Quantity updated. New total:', cartState.total);
	},

	toggle: () => {
		console.log('Toggling cart. Current state:', cartState.isOpen);
		cartState.isOpen = !cartState.isOpen;
		console.log('Cart toggled. New state:', cartState.isOpen);
	},

	close: () => {
		console.log('Closing cart');
		cartState.isOpen = false;
	},

	clear: () => {
		console.log('Clearing cart');
		cartState.items = [];
		cartState.total = 0;
		cartState.isOpen = false;
		cartState.loading = false;

		// Save to localStorage
		saveCartToStorage(cartState.items);
	}
};

// Computed values that are reactive - export as functions
export const itemCount = () => cartState.items.reduce((sum, item) => sum + item.quantity, 0);
export const isEmpty = () => cartState.items.length === 0;
