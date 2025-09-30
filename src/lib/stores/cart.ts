import { writable } from 'svelte/store';
import type { Tables } from '$lib/supabase';
import { supabase } from '$lib/supabase';
import {
	createTierReservation,
	updateTierReservation,
	removeTierReservation,
	getUserReservations,
	type TierReservation
} from '$lib/services/reservations';

export interface CartItem {
	id: string;
	product: Tables<'products'>;
	quantity: number;
	addedAt: Date;
	reservation?: TierReservation;
	reservationExpiry?: Date;
}

interface CartState {
	items: CartItem[];
	total: number;
	isOpen: boolean;
	loading: boolean;
	sessionId: string;
}

// Generate session ID for anonymous users
function generateSessionId(): string {
	return 'cart_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

const initialState: CartState = {
	items: [],
	total: 0,
	isOpen: false,
	loading: false,
	sessionId: generateSessionId()
};

function createCartStore() {
	const { subscribe, set, update } = writable<CartState>(initialState);

	return {
		subscribe,

		// Add item to cart with reservation
		addItem: async (product: Tables<'products'>, quantity: number = 1) => {
			// Get current user
			const {
				data: { user }
			} = await supabase.auth.getUser();

			// Handle reservation creation/update separately from store update
			const reservationResult: { reservation?: TierReservation; existingIndex: number } = {
				existingIndex: -1
			};

			// First, get current state to check for existing items
			const unsubscribe = subscribe((state) => {
				reservationResult.existingIndex = state.items.findIndex((item) => item.id === product.id);
			});
			unsubscribe();

			if (reservationResult.existingIndex >= 0) {
				// Get existing item and update its reservation
				let existingItem: CartItem | undefined;
				const unsubscribeForItem = subscribe((state) => {
					existingItem = state.items[reservationResult.existingIndex];
				});
				unsubscribeForItem();

				if (existingItem?.reservation) {
					const result = await updateTierReservation(
						existingItem.reservation.id,
						existingItem.quantity + quantity
					);
					if (result.success && result.reservation) {
						reservationResult.reservation = result.reservation;
					}
				} else {
					// Create reservation for existing item that doesn't have one
					let sessionId = '';
					const unsubscribeForSession = subscribe((state) => {
						sessionId = state.sessionId;
					});
					unsubscribeForSession();

					const result = await createTierReservation(
						product.id,
						(existingItem?.quantity || 0) + quantity,
						user?.id,
						user ? undefined : sessionId
					);
					if (result.success && result.reservation) {
						reservationResult.reservation = result.reservation;
					}
				}
			} else {
				// Create new reservation for new item
				let sessionId = '';
				const unsubscribeForSession = subscribe((state) => {
					sessionId = state.sessionId;
				});
				unsubscribeForSession();

				const result = await createTierReservation(
					product.id,
					quantity,
					user?.id,
					user ? undefined : sessionId
				);
				if (result.success && result.reservation) {
					reservationResult.reservation = result.reservation;
				}
			}

			// Now update the store with the reservation
			update((state) => {
				const existingIndex = state.items.findIndex((item) => item.id === product.id);

				if (existingIndex >= 0) {
					// Update quantity
					state.items[existingIndex].quantity += quantity;
					if (reservationResult.reservation) {
						state.items[existingIndex].reservation = reservationResult.reservation;
						state.items[existingIndex].reservationExpiry = new Date(
							reservationResult.reservation.expires_at
						);
					}
				} else {
					// Add new item
					state.items.push({
						id: product.id,
						product,
						quantity,
						addedAt: new Date(),
						reservation: reservationResult.reservation,
						reservationExpiry: reservationResult.reservation
							? new Date(reservationResult.reservation.expires_at)
							: undefined
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

		// Remove item from cart and its reservation
		removeItem: async (productId: string) => {
			// Find and remove reservation first
			let reservationId: string | undefined;
			const unsubscribe = subscribe((state) => {
				const item = state.items.find((item) => item.id === productId);
				reservationId = item?.reservation?.id;
			});
			unsubscribe();

			if (reservationId) {
				await removeTierReservation(reservationId);
			}

			update((state) => {
				state.items = state.items.filter((item) => item.id !== productId);
				state.total = state.items.reduce(
					(sum, item) => sum + item.product.price * item.quantity,
					0
				);
				return state;
			});
		},

		// Update item quantity and reservation
		updateQuantity: async (productId: string, quantity: number) => {
			const newQuantity = Math.max(1, quantity);

			// Update reservation first
			let reservationId: string | undefined;
			const unsubscribe = subscribe((state) => {
				const item = state.items.find((item) => item.id === productId);
				reservationId = item?.reservation?.id;
			});
			unsubscribe();

			let updatedReservation: TierReservation | undefined;
			if (reservationId) {
				const result = await updateTierReservation(reservationId, newQuantity);
				if (result.success && result.reservation) {
					updatedReservation = result.reservation;
				}
			}

			update((state) => {
				const item = state.items.find((item) => item.id === productId);
				if (item) {
					item.quantity = newQuantity;
					if (updatedReservation) {
						item.reservation = updatedReservation;
						item.reservationExpiry = new Date(updatedReservation.expires_at);
					}
					state.total = state.items.reduce(
						(sum, item) => sum + item.product.price * item.quantity,
						0
					);
				}
				return state;
			});
		},

		// Clear cart and all reservations
		clear: async () => {
			// Remove all reservations first
			const reservationIds: string[] = [];
			const unsubscribe = subscribe((state) => {
				state.items.forEach((item) => {
					if (item.reservation?.id) {
						reservationIds.push(item.reservation.id);
					}
				});
			});
			unsubscribe();

			// Remove all reservations
			await Promise.all(reservationIds.map((id) => removeTierReservation(id)));

			set({ ...initialState, sessionId: generateSessionId() });
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
		},

		// Load user reservations on login
		loadReservations: async (userId?: string, sessionId?: string) => {
			const reservations = await getUserReservations(userId, sessionId);

			update((state) => {
				// Match reservations with cart items
				state.items.forEach((item) => {
					const reservation = reservations.find((r) => r.product_id === item.product.id);
					if (reservation) {
						item.reservation = reservation;
						item.reservationExpiry = new Date(reservation.expires_at);
					}
				});
				return state;
			});
		},

		// Check and remove expired items
		cleanupExpired: () => {
			update((state) => {
				const now = new Date();
				state.items = state.items.filter((item) => {
					if (item.reservationExpiry && item.reservationExpiry <= now) {
						// Remove expired items
						return false;
					}
					return true;
				});

				// Recalculate total
				state.total = state.items.reduce(
					(sum, item) => sum + item.product.price * item.quantity,
					0
				);

				return state;
			});
		},

		// Get time remaining for item reservations
		getTimeRemaining: (productId: string): number => {
			let timeRemaining = 0;
			const unsubscribe = subscribe((state) => {
				const item = state.items.find((item) => item.id === productId);
				if (item?.reservationExpiry) {
					timeRemaining = Math.max(0, item.reservationExpiry.getTime() - Date.now());
				}
			});
			unsubscribe();
			return timeRemaining;
		}
	};
}

export const cart = createCartStore();
