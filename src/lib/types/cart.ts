export interface CartItem {
	tierId: string;
	quantity: number;
	addedAt: number;
}

export interface CartItemWithTier extends CartItem {
	tier: {
		id: string;
		name: string;
		price: number;
		slug: string;
		platformName: string;
		platformSlug: string;
		isActive: boolean;
	};
}

export interface CartStorage {
	items: CartItem[];
	lastUpdated: number;
}

export interface CartState {
	items: CartItem[];
	isOpen: boolean;
	loading: boolean;
	error: string | null;
}
