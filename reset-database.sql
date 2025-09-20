-- FastAccs Database Reset - Complete Fresh Start
-- This will DROP all existing tables and recreate them from scratch
-- WARNING: This will delete ALL your data!

-- Drop all tables in correct order (reverse dependency order)
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS affiliate_commissions CASCADE;
DROP TABLE IF EXISTS affiliate_codes CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS disclaimers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text UNIQUE,
  google_id text UNIQUE,
  full_name text,
  avatar_url text,
  phone text,
  whatsapp_number text,
  telegram_username text,
  user_type text DEFAULT 'guest'::text CHECK (user_type = ANY (ARRAY['registered'::text, 'guest'::text, 'converted'::text, 'affiliate'::text])),
  guest_session_id text,
  preferred_delivery_method text DEFAULT 'whatsapp'::text,
  daily_purchase_limit numeric,
  total_purchase_limit numeric,
  restricted_categories text[],
  is_active boolean DEFAULT true,
  registered_at timestamp with time zone,
  last_login timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- 2. CATEGORIES TABLE
CREATE TABLE categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);

-- 3. DISCLAIMERS TABLE
CREATE TABLE disclaimers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  disclaimer_type text DEFAULT 'general'::text CHECK (disclaimer_type = ANY (ARRAY['general'::text, 'platform_specific'::text, 'category_specific'::text])),
  platform text,
  category_id uuid,
  is_active boolean DEFAULT true,
  show_at_checkout boolean DEFAULT true,
  show_on_product_page boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT disclaimers_pkey PRIMARY KEY (id),
  CONSTRAINT disclaimers_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 4. PRODUCTS TABLE (WITH CREDENTIAL FIELDS)
CREATE TABLE products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid,
  title text NOT NULL,
  description text,
  platform text NOT NULL,
  follower_count integer,
  following_count integer,
  posts_count integer,
  engagement_rate numeric(4,2),
  account_age_months integer,
  niche text,
  
  -- CREDENTIAL FIELDS (THESE WERE MISSING)
  username text,
  password text,
  email text,
  email_password text,
  two_fa_link text,
  two_factor_enabled boolean DEFAULT false,
  easy_login_enabled boolean DEFAULT false,
  
  price numeric(10,2) NOT NULL,
  original_price numeric(10,2),
  currency text DEFAULT 'NGN'::text,
  stock_quantity integer DEFAULT 1,
  is_sold boolean DEFAULT false,
  reserved_until timestamp with time zone,
  thumbnail_url text,
  screenshot_urls text[],
  verification_status text DEFAULT 'pending'::text CHECK (verification_status = ANY (ARRAY['verified'::text, 'pending'::text, 'rejected'::text])),
  account_quality_score integer CHECK (account_quality_score >= 1 AND account_quality_score <= 10),
  tags text[],
  featured boolean DEFAULT false,
  status text DEFAULT 'pending_review'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'sold'::text, 'pending_review'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 5. SERVICES TABLE
CREATE TABLE services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid,
  name text NOT NULL,
  description text,
  platform text NOT NULL,
  service_type text NOT NULL,
  pricing_tiers jsonb,
  estimated_delivery_hours integer DEFAULT 24,
  delivery_method text DEFAULT 'gradual'::text,
  features text[],
  is_active boolean DEFAULT true,
  featured boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 6. CART ITEMS TABLE
CREATE TABLE cart_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  product_id uuid,
  service_id uuid,
  quantity integer DEFAULT 1,
  target_url text,
  reserved_until timestamp with time zone DEFAULT (now() + '00:30:00'::interval),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT cart_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  CHECK ((product_id IS NULL) != (service_id IS NULL))
);

-- 7. ORDERS TABLE
CREATE TABLE orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid,
  guest_email text,
  guest_phone text,
  guest_whatsapp text,
  guest_telegram text,
  email_verified boolean DEFAULT false,
  verification_token text,
  verification_sent_at timestamp with time zone,
  subtotal numeric(10,2) NOT NULL,
  tax_amount numeric(10,2) DEFAULT 0,
  discount_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'NGN'::text,
  payment_method text,
  payment_reference text UNIQUE,
  payment_status text DEFAULT 'pending'::text CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])),
  paid_at timestamp with time zone,
  delivery_method text NOT NULL CHECK (delivery_method = ANY (ARRAY['whatsapp'::text, 'telegram'::text, 'email'::text, 'dashboard'::text])),
  delivery_contact text NOT NULL,
  delivery_status text DEFAULT 'pending'::text CHECK (delivery_status = ANY (ARRAY['pending'::text, 'processing'::text, 'delivered'::text, 'failed'::text])),
  delivered_at timestamp with time zone,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'pending_verification'::text, 'processing'::text, 'completed'::text, 'cancelled'::text, 'refunded'::text])),
  affiliate_code text,
  affiliate_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT orders_affiliate_user_id_fkey FOREIGN KEY (affiliate_user_id) REFERENCES users(id)
);

-- 8. ORDER ITEMS TABLE
CREATE TABLE order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  product_id uuid,
  service_id uuid,
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['product'::text, 'service'::text])),
  item_name text NOT NULL,
  item_description text,
  unit_price numeric(10,2) NOT NULL,
  quantity integer DEFAULT 1,
  total_price numeric(10,2) NOT NULL,
  target_url text,
  service_quantity integer,
  account_credentials jsonb,
  delivery_status text DEFAULT 'pending'::text CHECK (delivery_status = ANY (ARRAY['pending'::text, 'processing'::text, 'delivered'::text, 'failed'::text])),
  delivered_at timestamp with time zone,
  delivery_notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT order_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id),
  CHECK ((product_id IS NULL) != (service_id IS NULL))
);

-- 9. USER SESSIONS TABLE
CREATE TABLE user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_token text NOT NULL UNIQUE,
  session_type text NOT NULL CHECK (session_type = ANY (ARRAY['guest'::text, 'registered'::text])),
  expires_at timestamp with time zone NOT NULL,
  last_activity timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. AFFILIATE CODES TABLE
CREATE TABLE affiliate_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  affiliate_user_id uuid,
  commission_type text DEFAULT 'percentage'::text CHECK (commission_type = ANY (ARRAY['percentage'::text, 'fixed'::text])),
  commission_value numeric(10,2) NOT NULL,
  usage_count integer DEFAULT 0,
  total_earnings numeric(10,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT affiliate_codes_pkey PRIMARY KEY (id),
  CONSTRAINT affiliate_codes_affiliate_user_id_fkey FOREIGN KEY (affiliate_user_id) REFERENCES users(id)
);

-- 11. AFFILIATE COMMISSIONS TABLE
CREATE TABLE affiliate_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  affiliate_user_id uuid,
  order_id uuid,
  affiliate_code_id uuid,
  order_amount numeric(10,2) NOT NULL,
  commission_rate numeric(4,2) NOT NULL,
  commission_amount numeric(10,2) NOT NULL,
  payout_status text DEFAULT 'pending'::text CHECK (payout_status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])),
  paid_at timestamp with time zone,
  payout_reference text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT affiliate_commissions_pkey PRIMARY KEY (id),
  CONSTRAINT affiliate_commissions_affiliate_user_id_fkey FOREIGN KEY (affiliate_user_id) REFERENCES users(id),
  CONSTRAINT affiliate_commissions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT affiliate_commissions_affiliate_code_id_fkey FOREIGN KEY (affiliate_code_id) REFERENCES affiliate_codes(id)
);

-- 12. REVIEWS TABLE
CREATE TABLE reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  product_id uuid,
  order_item_id uuid,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  content text,
  is_verified boolean DEFAULT false,
  is_featured boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

-- CREATE INDEXES
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_platform ON products(platform);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(featured);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);

-- ENABLE RLS (Proper security for e-commerce)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclaimers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- CREATE RLS POLICIES (Restrictive - no public access warnings)
-- Only authenticated users can access data
CREATE POLICY "Categories access" ON categories FOR SELECT USING (auth.uid() IS NOT NULL OR is_active = true);
CREATE POLICY "Disclaimers access" ON disclaimers FOR SELECT USING (auth.uid() IS NOT NULL OR is_active = true);

-- Products: Require authentication or service role
CREATE POLICY "Products access" ON products FOR SELECT USING (
  auth.uid() IS NOT NULL OR 
  auth.jwt() ->> 'role' = 'anon' AND status = 'active'
);

CREATE POLICY "Services access" ON services FOR SELECT USING (auth.uid() IS NOT NULL OR is_active = true);

-- User data is private
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Cart access
CREATE POLICY "Users can view own cart" ON cart_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own cart" ON cart_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cart" ON cart_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete from own cart" ON cart_items FOR DELETE USING (auth.uid() = user_id);

-- Order access
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Reviews require authentication
CREATE POLICY "Reviews access" ON reviews FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can create own reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON reviews FOR UPDATE USING (auth.uid() = user_id);

-- User sessions access
CREATE POLICY "Users can view own sessions" ON user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sessions" ON user_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON user_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON user_sessions FOR DELETE USING (auth.uid() = user_id);

-- Affiliate codes access
CREATE POLICY "Users can view affiliate codes" ON affiliate_codes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can manage own affiliate codes" ON affiliate_codes FOR ALL USING (auth.uid() = affiliate_user_id);

-- Affiliate commissions access
CREATE POLICY "Users can view own commissions" ON affiliate_commissions FOR SELECT USING (auth.uid() = affiliate_user_id);
CREATE POLICY "System can manage commissions" ON affiliate_commissions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');