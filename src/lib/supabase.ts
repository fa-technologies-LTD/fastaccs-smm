import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// Database types for TypeScript
export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

// Database type definitions (generated from your schema)
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
					user_type: 'registered' | 'guest' | 'converted' | 'affiliate';
					guest_session_id: string | null;
					preferred_delivery_method: string;
					daily_purchase_limit: number | null;
					total_purchase_limit: number | null;
					restricted_categories: string[] | null;
					is_active: boolean;
					registered_at: string | null;
					last_login: string;
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
					user_type?: 'registered' | 'guest' | 'converted' | 'affiliate';
					guest_session_id?: string | null;
					preferred_delivery_method?: string;
					daily_purchase_limit?: number | null;
					total_purchase_limit?: number | null;
					restricted_categories?: string[] | null;
					is_active?: boolean;
					registered_at?: string | null;
					last_login?: string;
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
					user_type?: 'registered' | 'guest' | 'converted' | 'affiliate';
					guest_session_id?: string | null;
					preferred_delivery_method?: string;
					daily_purchase_limit?: number | null;
					total_purchase_limit?: number | null;
					restricted_categories?: string[] | null;
					is_active?: boolean;
					registered_at?: string | null;
					last_login?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			categories: {
				Row: {
					id: string;
					name: string;
					slug: string;
					description: string | null;
					icon: string | null;
					sort_order: number;
					is_active: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					name: string;
					slug: string;
					description?: string | null;
					icon?: string | null;
					sort_order?: number;
					is_active?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					name?: string;
					slug?: string;
					description?: string | null;
					icon?: string | null;
					sort_order?: number;
					is_active?: boolean;
					created_at?: string;
				};
			};
			products: {
				Row: {
					id: string;
					category_id: string | null;
					title: string;
					description: string | null;
					platform: string;
					follower_count: number | null;
					following_count: number | null;
					posts_count: number | null;
					engagement_rate: number | null;
					account_age_months: number | null;
					niche: string | null;
					price: number;
					original_price: number | null;
					currency: string;
					stock_quantity: number;
					is_sold: boolean;
					reserved_until: string | null;
					thumbnail_url: string | null;
					screenshot_urls: string[] | null;
					verification_status: 'verified' | 'pending' | 'rejected';
					account_quality_score: number | null;
					tags: string[] | null;
					featured: boolean;
					status: 'active' | 'inactive' | 'sold' | 'pending_review';
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					category_id?: string | null;
					title: string;
					description?: string | null;
					platform: string;
					follower_count?: number | null;
					following_count?: number | null;
					posts_count?: number | null;
					engagement_rate?: number | null;
					account_age_months?: number | null;
					niche?: string | null;
					price: number;
					original_price?: number | null;
					currency?: string;
					stock_quantity?: number;
					is_sold?: boolean;
					reserved_until?: string | null;
					thumbnail_url?: string | null;
					screenshot_urls?: string[] | null;
					verification_status?: 'verified' | 'pending' | 'rejected';
					account_quality_score?: number | null;
					tags?: string[] | null;
					featured?: boolean;
					status?: 'active' | 'inactive' | 'sold' | 'pending_review';
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					category_id?: string | null;
					title?: string;
					description?: string | null;
					platform?: string;
					follower_count?: number | null;
					following_count?: number | null;
					posts_count?: number | null;
					engagement_rate?: number | null;
					account_age_months?: number | null;
					niche?: string | null;
					price?: number;
					original_price?: number | null;
					currency?: string;
					stock_quantity?: number;
					is_sold?: boolean;
					reserved_until?: string | null;
					thumbnail_url?: string | null;
					screenshot_urls?: string[] | null;
					verification_status?: 'verified' | 'pending' | 'rejected';
					account_quality_score?: number | null;
					tags?: string[] | null;
					featured?: boolean;
					status?: 'active' | 'inactive' | 'sold' | 'pending_review';
					created_at?: string;
					updated_at?: string;
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
					payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
					paid_at: string | null;
					delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact: string;
					delivery_status: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at: string | null;
					status:
						| 'pending'
						| 'pending_verification'
						| 'processing'
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
					payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
					paid_at?: string | null;
					delivery_method: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact: string;
					delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at?: string | null;
					status?:
						| 'pending'
						| 'pending_verification'
						| 'processing'
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
					payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
					paid_at?: string | null;
					delivery_method?: 'whatsapp' | 'telegram' | 'email' | 'dashboard';
					delivery_contact?: string;
					delivery_status?: 'pending' | 'processing' | 'delivered' | 'failed';
					delivered_at?: string | null;
					status?:
						| 'pending'
						| 'pending_verification'
						| 'processing'
						| 'completed'
						| 'cancelled'
						| 'refunded';
					affiliate_code?: string | null;
					affiliate_user_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			generate_order_number: {
				Args: Record<PropertyKey, never>;
				Returns: string;
			};
			handle_google_login: {
				Args: {
					p_google_id: string;
					p_email: string;
					p_full_name: string;
					p_avatar_url: string;
					p_guest_session_token?: string;
				};
				Returns: string;
			};
			reserve_product_for_cart: {
				Args: {
					p_user_id: string;
					p_product_id: string;
				};
				Returns: boolean;
			};
			cleanup_expired_sessions: {
				Args: Record<PropertyKey, never>;
				Returns: number;
			};
		};
		Enums: {
			[_ in never]: never;
		};
	};
}

// Utility functions for common operations
export class DatabaseService {
	constructor(private supabaseClient: SupabaseClient<Database>) {}

	// Products
	async getProducts(options?: {
		category?: string;
		platform?: string;
		featured?: boolean;
		limit?: number;
		offset?: number;
	}) {
		let query = this.supabaseClient
			.from('products')
			.select(
				`
        *,
        categories (
          name,
          slug
        )
      `
			)
			.eq('status', 'active')
			.eq('is_sold', false);

		if (options?.category) {
			query = query.eq('categories.slug', options.category);
		}
		if (options?.platform) {
			query = query.eq('platform', options.platform);
		}
		if (options?.featured) {
			query = query.eq('featured', true);
		}
		if (options?.limit) {
			query = query.limit(options.limit);
		}
		if (options?.offset) {
			query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
		}

		return query.order('created_at', { ascending: false });
	}

	async getProduct(id: string) {
		return this.supabaseClient
			.from('products')
			.select(
				`
        *,
        categories (
          name,
          slug
        ),
        reviews (
          id,
          rating,
          title,
          content,
          created_at,
          users (
            full_name
          )
        )
      `
			)
			.eq('id', id)
			.eq('status', 'active')
			.single();
	}

	// Categories
	async getCategories() {
		return this.supabaseClient
			.from('categories')
			.select('*')
			.eq('is_active', true)
			.order('sort_order');
	}

	// Cart operations
	async addToCart(userId: string, productId: string) {
		// Use the reserve function to handle race conditions
		return this.supabaseClient.rpc('reserve_product_for_cart', {
			p_user_id: userId,
			p_product_id: productId
		});
	}

	async getCartItems(userId: string) {
		return this.supabaseClient
			.from('cart_items')
			.select(
				`
        *,
        products (
          id,
          title,
          price,
          thumbnail_url,
          platform,
          follower_count
        ),
        services (
          id,
          name,
          platform,
          pricing_tiers
        )
      `
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
	}

	async removeFromCart(userId: string, itemId: string) {
		return this.supabaseClient.from('cart_items').delete().eq('id', itemId).eq('user_id', userId);
	}

	// Orders
	async createOrder(orderData: Database['public']['Tables']['orders']['Insert']) {
		const { data: orderNumber } = await this.supabaseClient.rpc('generate_order_number');

		return this.supabaseClient
			.from('orders')
			.insert({
				...orderData,
				order_number: orderNumber || 'ORD-001'
			})
			.select()
			.single();
	}

	async getUserOrders(userId: string) {
		return this.supabaseClient
			.from('orders')
			.select(
				`
        *,
        order_items (
          *,
          products (
            title,
            platform
          ),
          services (
            name,
            platform
          )
        )
      `
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
	}

	// User management
	async createGuestUser(sessionToken: string) {
		return this.supabaseClient
			.from('users')
			.insert({
				user_type: 'guest',
				guest_session_id: sessionToken
			})
			.select()
			.single();
	}

	async getUserBySession(sessionToken: string) {
		return this.supabaseClient
			.from('users')
			.select('*')
			.eq('guest_session_id', sessionToken)
			.single();
	}
}

// Export a singleton instance for backward compatibility
export const db = new DatabaseService(supabase);
