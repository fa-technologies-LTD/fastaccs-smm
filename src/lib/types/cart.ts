import type { TierDeliveryMode } from '$lib/helpers/tier-delivery-config';

export interface CartItem {
	cartItemId?: string;
	tierId: string;
	quantity: number;
	addedAt: number;
	exactAccount?: {
		accountId: string;
		displayLabel: string;
		profileUrl: string;
		screenshotUrl?: string | null;
		reservedUntil: string;
	};
	boosting?: {
		targetUrl: string;
		boostQuantity: number;
	};
}

export interface CartItemWithTier extends CartItem {
	tier: {
		id: string;
		name: string;
		price: number;
		slug: string;
		platformName: string;
		platformSlug: string;
		platformIcon?: string | null;
		isActive: boolean;
		deliveryMode?: TierDeliveryMode;
		boostingConfig?: {
			minQuantity: number;
			stepQuantity: number;
			pricePerStep: number;
			platform: string;
			actionType: string;
		};
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
	notice: string | null;
}
