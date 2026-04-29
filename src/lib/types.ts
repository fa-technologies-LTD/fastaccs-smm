// Generated database types for FastAccs - Bulletproof Schema
// This file provides complete TypeScript definitions for all database interactions

export interface Database {
	public: {
		Tables: {
			users: {
				Row: {
					id: string;
					email: string | null;
					google_id: string | null;
					full_name: string | null;
					avatar_url: string | null;
					phone: string | null;
					whatsapp_number: string | null;
					telegram_username: string | null;
					user_type: 'registered' | 'guest' | 'converted' | 'affiliate' | 'admin';
					guest_session_id: string | null;
					preferred_delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					daily_purchase_limit: number | null;
					total_purchase_limit: number | null;
					restricted_categories: string[] | null;
					is_active: boolean;
					email_verified: boolean;
					registered_at: string | null;
					last_login: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					email?: string | null;
					google_id?: string | null;
					full_name?: string | null;
					avatar_url?: string | null;
					phone?: string | null;
					whatsapp_number?: string | null;
					telegram_username?: string | null;
					user_type?: 'registered' | 'guest' | 'converted' | 'affiliate' | 'admin';
					guest_session_id?: string | null;
					preferred_delivery_method?: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					daily_purchase_limit?: number | null;
					total_purchase_limit?: number | null;
					restricted_categories?: string[] | null;
					is_active?: boolean;
					email_verified?: boolean;
					registered_at?: string | null;
					last_login?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					email?: string | null;
					google_id?: string | null;
					full_name?: string | null;
					avatar_url?: string | null;
					phone?: string | null;
					whatsapp_number?: string | null;
					telegram_username?: string | null;
					user_type?: 'registered' | 'guest' | 'converted' | 'affiliate' | 'admin';
					guest_session_id?: string | null;
					preferred_delivery_method?: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					daily_purchase_limit?: number | null;
					total_purchase_limit?: number | null;
					restricted_categories?: string[] | null;
					is_active?: boolean;
					email_verified?: boolean;
					registered_at?: string | null;
					last_login?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			categories: {
				Row: {
					id: string;
					parent_id: string | null;
					name: string;
					slug: string;
					description: string | null;
					category_type: 'platform' | 'tier' | 'service_group';
					metadata: Record<string, unknown>;
					sort_order: number;
					is_active: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					parent_id?: string | null;
					name: string;
					slug: string;
					description?: string | null;
					category_type: 'platform' | 'tier' | 'service_group';
					metadata?: Record<string, unknown>;
					sort_order?: number;
					is_active?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					parent_id?: string | null;
					name?: string;
					slug?: string;
					description?: string | null;
					category_type?: 'platform' | 'tier' | 'service_group';
					metadata?: Record<string, unknown>;
					sort_order?: number;
					is_active?: boolean;
					created_at?: string;
					updated_at?: string;
				};
			};
			products: {
				Row: {
					id: string;
					category_id: string;
					name: string;
					slug: string;
					description: string | null;
					price: number;
					currency: string;
					sku_type: 'tier' | 'unique' | 'service';
					status: 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
					screenshot_urls: string[] | null;
					tags: string[] | null;
					featured: boolean;
					stock_quantity: number;
					reserved_quantity: number;
					meta_title: string | null;
					meta_description: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					category_id: string;
					name: string;
					slug: string;
					description?: string | null;
					price: number;
					currency?: string;
					sku_type?: 'tier' | 'unique' | 'service';
					status?: 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
					screenshot_urls?: string[] | null;
					tags?: string[] | null;
					featured?: boolean;
					stock_quantity?: number;
					reserved_quantity?: number;
					meta_title?: string | null;
					meta_description?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					category_id?: string;
					name?: string;
					slug?: string;
					description?: string | null;
					price?: number;
					currency?: string;
					sku_type?: 'tier' | 'unique' | 'service';
					status?: 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
					screenshot_urls?: string[] | null;
					tags?: string[] | null;
					featured?: boolean;
					stock_quantity?: number;
					reserved_quantity?: number;
					meta_title?: string | null;
					meta_description?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			account_batches: {
				Row: {
					id: string;
					category_id: string;
					supplier: string | null;
					cost_per_unit: number | null;
					descriptors: Record<string, unknown>;
					links_raw: string | null;
					logs_raw: string | null;
					notes: string | null;
					total_units: number;
					remaining_units: number;
					import_status: 'pending' | 'processing' | 'completed' | 'failed';
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					category_id: string;
					supplier?: string | null;
					cost_per_unit?: number | null;
					descriptors?: Record<string, unknown>;
					links_raw?: string | null;
					logs_raw?: string | null;
					notes?: string | null;
					total_units: number;
					remaining_units?: number;
					import_status?: 'pending' | 'processing' | 'completed' | 'failed';
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					category_id?: string;
					supplier?: string | null;
					cost_per_unit?: number | null;
					descriptors?: Record<string, unknown>;
					links_raw?: string | null;
					logs_raw?: string | null;
					notes?: string | null;
					total_units?: number;
					remaining_units?: number;
					import_status?: 'pending' | 'processing' | 'completed' | 'failed';
					created_at?: string;
					updated_at?: string;
				};
			};
			accounts: {
				Row: {
					id: string;
					batch_id: string;
					category_id: string;
					platform: string;
					link_url: string | null;
					username: string | null;
					password: string | null;
					email: string | null;
					email_password: string | null;
					two_fa: string | null;
					two_factor_enabled: boolean | null;
					easy_login_enabled: boolean | null;
					followers: number | null;
					following: number | null;
					posts_count: number | null;
					engagement_rate: number | null;
						age_months: number | null;
						niche: string | null;
						quality_score: number | null;
						credential_extras: Record<string, string> | null;
						status: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
					reserved_until: string | null;
					order_item_id: string | null;
					delivered_at: string | null;
					delivery_notes: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					batch_id: string;
					category_id: string;
					platform: string;
					link_url?: string | null;
					username?: string | null;
					password?: string | null;
					email?: string | null;
					email_password?: string | null;
					two_fa?: string | null;
					two_factor_enabled?: boolean | null;
					easy_login_enabled?: boolean | null;
					followers?: number | null;
					following?: number | null;
					posts_count?: number | null;
					engagement_rate?: number | null;
						age_months?: number | null;
						niche?: string | null;
						quality_score?: number | null;
						credential_extras?: Record<string, string> | null;
						status?: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
					reserved_until?: string | null;
					order_item_id?: string | null;
					delivered_at?: string | null;
					delivery_notes?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					batch_id?: string;
					category_id?: string;
					platform?: string;
					link_url?: string | null;
					username?: string | null;
					password?: string | null;
					email?: string | null;
					email_password?: string | null;
					two_fa?: string | null;
					two_factor_enabled?: boolean | null;
					easy_login_enabled?: boolean | null;
					followers?: number | null;
					following?: number | null;
					posts_count?: number | null;
					engagement_rate?: number | null;
						age_months?: number | null;
						niche?: string | null;
						quality_score?: number | null;
						credential_extras?: Record<string, string> | null;
						status?: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
					reserved_until?: string | null;
					order_item_id?: string | null;
					delivered_at?: string | null;
					delivery_notes?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			tier_reservations: {
				Row: {
					id: string;
					product_id: string;
					user_id: string | null;
					user_session_id: string | null;
					quantity: number;
					expires_at: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					product_id: string;
					user_id?: string | null;
					user_session_id?: string | null;
					quantity: number;
					expires_at: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					product_id?: string;
					user_id?: string | null;
					user_session_id?: string | null;
					quantity?: number;
					expires_at?: string;
					created_at?: string;
				};
			};
			orders: {
				Row: {
					id: string;
					order_number: string;
					user_id: string | null;
					guest_email: string | null;
					guest_phone: string | null;
					guest_whatsapp: string | null;
					guest_telegram: string | null;
					email_verified: boolean;
					verification_token: string | null;
					verification_sent_at: string | null;
					subtotal: number;
					tax_amount: number;
					discount_amount: number;
					total_amount: number;
					currency: string;
					payment_method: string | null;
					payment_reference: string | null;
					payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
					paid_at: string | null;
					delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact: string;
					delivery_status: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at: string | null;
					status:
						| 'pending'
						| 'pending_verification'
						| 'processing'
						| 'allocated'
						| 'completed'
						| 'cancelled'
						| 'refunded';
					affiliate_code: string | null;
					affiliate_user_id: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					order_number: string;
					user_id?: string | null;
					guest_email?: string | null;
					guest_phone?: string | null;
					guest_whatsapp?: string | null;
					guest_telegram?: string | null;
					email_verified?: boolean;
					verification_token?: string | null;
					verification_sent_at?: string | null;
					subtotal: number;
					tax_amount?: number;
					discount_amount?: number;
					total_amount: number;
					currency?: string;
					payment_method?: string | null;
					payment_reference?: string | null;
					payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
					paid_at?: string | null;
					delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact: string;
					delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at?: string | null;
					status?:
						| 'pending'
						| 'pending_verification'
						| 'processing'
						| 'allocated'
						| 'completed'
						| 'cancelled'
						| 'refunded';
					affiliate_code?: string | null;
					affiliate_user_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					order_number?: string;
					user_id?: string | null;
					guest_email?: string | null;
					guest_phone?: string | null;
					guest_whatsapp?: string | null;
					guest_telegram?: string | null;
					email_verified?: boolean;
					verification_token?: string | null;
					verification_sent_at?: string | null;
					subtotal?: number;
					tax_amount?: number;
					discount_amount?: number;
					total_amount?: number;
					currency?: string;
					payment_method?: string | null;
					payment_reference?: string | null;
					payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
					paid_at?: string | null;
					delivery_method?: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact?: string;
					delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at?: string | null;
					status?:
						| 'pending'
						| 'pending_verification'
						| 'processing'
						| 'allocated'
						| 'completed'
						| 'cancelled'
						| 'refunded';
					affiliate_code?: string | null;
					affiliate_user_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			order_items: {
				Row: {
					id: string;
					order_id: string;
					product_id: string;
					quantity: number;
					unit_price: number;
					total_price: number;
					product_name: string;
					product_category: string;
					allocation_status: 'pending' | 'allocating' | 'allocated' | 'partial' | 'failed';
					allocated_count: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					order_id: string;
					product_id: string;
					quantity: number;
					unit_price: number;
					total_price: number;
					product_name: string;
					product_category: string;
					allocation_status?: 'pending' | 'allocating' | 'allocated' | 'partial' | 'failed';
					allocated_count?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					order_id?: string;
					product_id?: string;
					quantity?: number;
					unit_price?: number;
					total_price?: number;
					product_name?: string;
					product_category?: string;
					allocation_status?: 'pending' | 'allocating' | 'allocated' | 'partial' | 'failed';
					allocated_count?: number;
					created_at?: string;
					updated_at?: string;
				};
			};
			cart_items: {
				Row: {
					id: string;
					user_id: string;
					product_id: string;
					quantity: number;
					added_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					product_id: string;
					quantity: number;
					added_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					product_id?: string;
					quantity?: number;
					added_at?: string;
				};
			};
			reviews: {
				Row: {
					id: string;
					product_id: string;
					user_id: string;
					order_item_id: string | null;
					rating: number;
					title: string | null;
					content: string | null;
					image_urls: string[] | null;
					status: 'published' | 'pending' | 'rejected' | 'flagged';
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					product_id: string;
					user_id: string;
					order_item_id?: string | null;
					rating: number;
					title?: string | null;
					content?: string | null;
					image_urls?: string[] | null;
					status?: 'published' | 'pending' | 'rejected' | 'flagged';
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					product_id?: string;
					user_id?: string;
					order_item_id?: string | null;
					rating?: number;
					title?: string | null;
					content?: string | null;
					image_urls?: string[] | null;
					status?: 'published' | 'pending' | 'rejected' | 'flagged';
					created_at?: string;
					updated_at?: string;
				};
			};
			notifications: {
				Row: {
					id: string;
					user_id: string;
					type:
						| 'order_status'
						| 'delivery'
						| 'payment'
						| 'account_ready'
						| 'system'
						| 'promotional';
					title: string;
					message: string;
					order_id: string | null;
					read: boolean;
					read_at: string | null;
					created_at: string;
					expires_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					type:
						| 'order_status'
						| 'delivery'
						| 'payment'
						| 'account_ready'
						| 'system'
						| 'promotional';
					title: string;
					message: string;
					order_id?: string | null;
					read?: boolean;
					read_at?: string | null;
					created_at?: string;
					expires_at?: string | null;
				};
				Update: {
					id?: string;
					user_id?: string;
					type?:
						| 'order_status'
						| 'delivery'
						| 'payment'
						| 'account_ready'
						| 'system'
						| 'promotional';
					title?: string;
					message?: string;
					order_id?: string | null;
					read?: boolean;
					read_at?: string | null;
					created_at?: string;
					expires_at?: string | null;
				};
			};
			affiliate_programs: {
				Row: {
					id: string;
					user_id: string;
					affiliate_code: string;
					commission_rate: number;
					total_referrals: number;
					total_sales: number;
					total_commission: number;
					status: 'active' | 'suspended' | 'terminated';
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					affiliate_code: string;
					commission_rate?: number;
					total_referrals?: number;
					total_sales?: number;
					total_commission?: number;
					status?: 'active' | 'suspended' | 'terminated';
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					affiliate_code?: string;
					commission_rate?: number;
					total_referrals?: number;
					total_sales?: number;
					total_commission?: number;
					status?: 'active' | 'suspended' | 'terminated';
					created_at?: string;
					updated_at?: string;
				};
			};
		};
		Views: {
			mv_tier_inventory: {
				Row: {
					product_id: string;
					tier_name: string;
					tier_slug: string;
					category_id: string;
					category_name: string;
					metadata: Record<string, unknown>;
					accounts_available: number;
					accounts_reserved: number;
					reservations_active: number;
					visible_available: number;
					price: number;
					product_status: string;
					tier_active: boolean;
					platform_name: string;
					platform_slug: string;
					last_updated: string;
				};
			};
			mv_platform_summary: {
				Row: {
					platform_id: string;
					platform_name: string;
					platform_slug: string;
					description: string | null;
					metadata: Record<string, unknown>;
					tier_count: number;
					product_count: number;
					total_accounts_available: number;
					total_visible_available: number;
					min_price: number | null;
					max_price: number | null;
					avg_price: number | null;
					last_updated: string;
				};
			};
			mv_order_summary: {
				Row: {
					id: string;
					order_number: string;
					user_id: string | null;
					guest_email: string | null;
					customer_name: string | null;
					total_amount: number;
					currency: string;
					status: string;
					payment_status: string;
					delivery_method: string;
					delivery_status: string;
					total_items: number;
					total_quantity: number;
					total_allocated: number;
					created_at: string;
					updated_at: string;
					delivered_at: string | null;
					last_updated: string;
				};
			};
		};
		Functions: {
			generate_order_number: {
				Args: Record<PropertyKey, never>;
				Returns: string;
			};
			cleanup_expired_reservations: {
				Args: Record<PropertyKey, never>;
				Returns: number;
			};
			allocate_accounts_for_order_item: {
				Args: {
					p_order_item_id: string;
					p_category_id: string;
					p_quantity: number;
				};
				Returns: number;
			};
			run_maintenance: {
				Args: Record<PropertyKey, never>;
				Returns: void;
			};
		};
		Enums: {
			user_type: 'registered' | 'guest' | 'converted' | 'affiliate' | 'admin';
			category_type: 'platform' | 'tier' | 'service_group';
			delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
			order_status:
				| 'pending'
				| 'pending_verification'
				| 'processing'
				| 'allocated'
				| 'completed'
				| 'cancelled'
				| 'refunded';
			payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
			account_status: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
			product_status: 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
			allocation_status: 'pending' | 'allocating' | 'allocated' | 'partial' | 'failed';
		};
	};
}

// Type helpers for easier usage
export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Update'];

export type Views<T extends keyof Database['public']['Views']> =
	Database['public']['Views'][T]['Row'];

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type Functions<T extends keyof Database['public']['Functions']> =
	Database['public']['Functions'][T];

// Common type aliases for convenience
export type User = Tables<'users'>;
export type Category = Tables<'categories'>;
export type Product = Tables<'products'>;
export type Account = Tables<'accounts'>;
export type AccountBatch = Tables<'account_batches'>;
export type Order = Tables<'orders'>;
export type OrderItem = Tables<'order_items'>;
export type TierReservation = Tables<'tier_reservations'>;
export type CartItem = Tables<'cart_items'>;
export type Review = Tables<'reviews'>;
export type Notification = Tables<'notifications'>;
export type AffiliateProgram = Tables<'affiliate_programs'>;

// View types
export type TierInventory = Views<'mv_tier_inventory'>;
export type PlatformSummary = Views<'mv_platform_summary'>;
export type OrderSummary = Views<'mv_order_summary'>;

// Insert types
export type UserInsert = TablesInsert<'users'>;
export type CategoryInsert = TablesInsert<'categories'>;
export type ProductInsert = TablesInsert<'products'>;
export type AccountInsert = TablesInsert<'accounts'>;
export type AccountBatchInsert = TablesInsert<'account_batches'>;
export type OrderInsert = TablesInsert<'orders'>;
export type OrderItemInsert = TablesInsert<'order_items'>;
export type TierReservationInsert = TablesInsert<'tier_reservations'>;
export type CartItemInsert = TablesInsert<'cart_items'>;
export type ReviewInsert = TablesInsert<'reviews'>;
export type NotificationInsert = TablesInsert<'notifications'>;

// Update types
export type UserUpdate = TablesUpdate<'users'>;
export type CategoryUpdate = TablesUpdate<'categories'>;
export type ProductUpdate = TablesUpdate<'products'>;
export type AccountUpdate = TablesUpdate<'accounts'>;
export type AccountBatchUpdate = TablesUpdate<'account_batches'>;
export type OrderUpdate = TablesUpdate<'orders'>;
export type OrderItemUpdate = TablesUpdate<'order_items'>;
export type TierReservationUpdate = TablesUpdate<'tier_reservations'>;
export type CartItemUpdate = TablesUpdate<'cart_items'>;
export type ReviewUpdate = TablesUpdate<'reviews'>;
export type NotificationUpdate = TablesUpdate<'notifications'>;

// Enum types
export type UserType = Enums<'user_type'>;
export type CategoryType = Enums<'category_type'>;
export type DeliveryMethod = Enums<'delivery_method'>;
export type OrderStatus = Enums<'order_status'>;
export type PaymentStatus = Enums<'payment_status'>;
export type AccountStatus = Enums<'account_status'>;
export type ProductStatus = Enums<'product_status'>;
export type AllocationStatus = Enums<'allocation_status'>;
