import { writable } from 'svelte/store';
import type { Tables } from '$lib/supabase';
import { supabase } from '$lib/supabase';

export interface CartItem {
	id: string;
	product: Tables<'products'>;
	quantity: number;
	addedAt: Date;
}

interface CartState {
	items: CartItem[];
	total: number;
	isOpen: boolean;
	loading: boolean;
}

const initialState: CartState = {
	items: [],
	total: 0,
	isOpen: false,
	loading: false
};

function createCartStore() {
	const { subscribe, set, update } = writable<CartState>(initialState);

	return {
		subscribe,

		// Add item to cart
		addItem: (product: Tables<'products'>, quantity: number = 1) => {
			update((state) => {
				const existingIndex = state.items.findIndex((item) => item.id === product.id);

				if (existingIndex >= 0) {
					// Update quantity if item exists
					state.items[existingIndex].quantity += quantity;
				} else {
					// Add new item
					state.items.push({
						id: product.id,
						product,
						quantity,
						addedAt: new Date()
					});
				}

				// Recalculate total
				state.total = state.items.reduce(
					(sum, item) => sum + item.product.price * item.quantity,
					0
				);

				return state;
			});
		},

		// Remove item from cart
		removeItem: (productId: string) => {
			update((state) => {
				state.items = state.items.filter((item) => item.id !== productId);
				state.total = state.items.reduce(
					(sum, item) => sum + item.product.price * item.quantity,
					0
				);
				return state;
			});
		},

		// Update item quantity
		updateQuantity: (productId: string, quantity: number) => {
			update((state) => {
				const item = state.items.find((item) => item.id === productId);
				if (item) {
					item.quantity = Math.max(1, quantity);
					state.total = state.items.reduce(
						(sum, item) => sum + item.product.price * item.quantity,
						0
					);
				}
				return state;
			});
		},

		// Clear cart
		clear: () => {
			set(initialState);
		},

		// Toggle cart dropdown
		toggle: () => {
			update((state) => {
				state.isOpen = !state.isOpen;
				return state;
			});
		},

		// Close cart
		close: () => {
			update((state) => {
				state.isOpen = false;
				return state;
			});
		},

		// Save cart to Supabase (for logged-in users)
		saveToDatabase: async (userId: string) => {
			update((state) => {
				state.loading = true;
				return state;
			});

			try {
				const {
					data: { user }
				} = await supabase.auth.getUser();
				if (user) {
					// Clear existing cart items
					await supabase.from('cart_items').delete().eq('user_id', userId);

					// Insert current cart items
					const cartItems: Array<{
						user_id: string;
						product_id: string;
						quantity: number;
					}> = [];

					update((state) => {
						for (const item of state.items) {
							cartItems.push({
								user_id: userId,
								product_id: item.product.id,
								quantity: item.quantity
							});
						}
						return state;
					});

					if (cartItems.length > 0) {
						await supabase.from('cart_items').insert(cartItems);
					}
				}
			} catch (error) {
				console.error('Error saving cart to database:', error);
			} finally {
				update((state) => {
					state.loading = false;
					return state;
				});
			}
		},

		// Load cart from Supabase
		loadFromDatabase: async (userId: string) => {
			update((state) => {
				state.loading = true;
				return state;
			});

			try {
				const { data: cartItems } = await supabase
					.from('cart_items')
					.select(
						`
						*,
						products (*)
					`
					)
					.eq('user_id', userId);

				if (cartItems) {
					update((state) => {
						state.items = cartItems.map((item) => ({
							id: item.product_id,
							product: item.products as Tables<'products'>,
							quantity: item.quantity,
							addedAt: new Date(item.created_at)
						}));
						state.total = state.items.reduce(
							(sum, item) => sum + item.product.price * item.quantity,
							0
						);
						return state;
					});
				}
			} catch (error) {
				console.error('Error loading cart from database:', error);
			} finally {
				update((state) => {
					state.loading = false;
					return state;
				});
			}
		}
	};
}

export const cart = createCartStore();
