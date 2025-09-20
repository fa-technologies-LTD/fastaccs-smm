export interface Category {
	id: string;
	name: string;
	slug: string;
	description: string;
	icon: string;
	sort_order: number;
	is_active: boolean;
	created_at: string;
}

export interface Disclaimer {
	id: string;
	title: string;
	content: string;
	disclaimer_type: 'general' | 'platform_specific' | 'category_specific';
	platform: string | null;
	category_id: string | null;
	is_active: boolean;
	show_at_checkout: boolean;
	show_on_product_page: boolean;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

export interface Product {
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
	username: string | null;
	password: string | null;
	email: string | null;
	email_password: string | null;
	two_fa_link: string | null;
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
	two_factor_enabled: boolean;
	easy_login_enabled: boolean;
	tags: string[] | null;
	featured: boolean;
	status: 'active' | 'inactive' | 'sold' | 'pending_review';
	created_at: string;
	updated_at: string;
}

export interface PageData {
	products: Product[];
	categories: Category[];
	disclaimers: Disclaimer[];
	errors?: {
		products?: string;
		categories?: string;
		disclaimers?: string;
		general?: string;
	};
}
