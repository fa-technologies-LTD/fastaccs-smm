-- FastAccs Database Tables Only
-- Run this first to create all tables

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  google_id TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  telegram_username TEXT,
  user_type TEXT CHECK (user_type IN ('registered', 'guest', 'converted', 'affiliate')) DEFAULT 'guest',
  guest_session_id TEXT,
  preferred_delivery_method TEXT DEFAULT 'whatsapp',
  daily_purchase_limit DECIMAL(10,2),
  total_purchase_limit DECIMAL(10,2),
  restricted_categories TEXT[],
  is_active BOOLEAN DEFAULT true,
  registered_at TIMESTAMP WITH TIME ZONE,
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. DISCLAIMERS TABLE
CREATE TABLE IF NOT EXISTS disclaimers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  disclaimer_type TEXT CHECK (disclaimer_type IN ('general', 'platform_specific', 'category_specific')) DEFAULT 'general',
  platform TEXT,
  category_id UUID REFERENCES categories(id),
  is_active BOOLEAN DEFAULT true,
  show_at_checkout BOOLEAN DEFAULT true,
  show_on_product_page BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL,
  follower_count INTEGER,
  following_count INTEGER,
  posts_count INTEGER,
  engagement_rate DECIMAL(4,2),
  account_age_months INTEGER,
  niche TEXT,
  username TEXT,
  password TEXT,
  email TEXT,
  email_password TEXT,
  two_fa_link TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  currency TEXT DEFAULT 'NGN',
  stock_quantity INTEGER DEFAULT 1,
  is_sold BOOLEAN DEFAULT false,
  reserved_until TIMESTAMP WITH TIME ZONE,
  thumbnail_url TEXT,
  screenshot_urls TEXT[],
  verification_status TEXT CHECK (verification_status IN ('verified', 'pending', 'rejected')) DEFAULT 'pending',
  account_quality_score INTEGER CHECK (account_quality_score BETWEEN 1 AND 10),
  two_factor_enabled BOOLEAN DEFAULT false,
  easy_login_enabled BOOLEAN DEFAULT false,
  tags TEXT[],
  featured BOOLEAN DEFAULT false,
  status TEXT CHECK (status IN ('active', 'inactive', 'sold', 'pending_review')) DEFAULT 'pending_review',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. SERVICES TABLE
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL,
  service_type TEXT NOT NULL,
  pricing_tiers JSONB,
  estimated_delivery_hours INTEGER DEFAULT 24,
  delivery_method TEXT DEFAULT 'gradual',
  features TEXT[],
  is_active BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. CART ITEMS TABLE
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  target_url TEXT,
  reserved_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK ((product_id IS NULL) != (service_id IS NULL))
);

-- 7. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  guest_email TEXT,
  guest_phone TEXT,
  guest_whatsapp TEXT,
  guest_telegram TEXT,
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verification_sent_at TIMESTAMP WITH TIME ZONE,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  payment_method TEXT,
  payment_reference TEXT UNIQUE,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  delivery_method TEXT CHECK (delivery_method IN ('whatsapp', 'telegram', 'email', 'dashboard')) NOT NULL,
  delivery_contact TEXT NOT NULL,
  delivery_status TEXT CHECK (delivery_status IN ('pending', 'processing', 'delivered', 'failed')) DEFAULT 'pending',
  delivered_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('pending', 'pending_verification', 'processing', 'completed', 'cancelled', 'refunded')) DEFAULT 'pending',
  affiliate_code TEXT,
  affiliate_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  service_id UUID REFERENCES services(id),
  item_type TEXT CHECK (item_type IN ('product', 'service')) NOT NULL,
  item_name TEXT NOT NULL,
  item_description TEXT,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  total_price DECIMAL(10,2) NOT NULL,
  target_url TEXT,
  service_quantity INTEGER,
  account_credentials JSONB,
  delivery_status TEXT CHECK (delivery_status IN ('pending', 'processing', 'delivered', 'failed')) DEFAULT 'pending',
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivery_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK ((product_id IS NULL) != (service_id IS NULL))
);

-- 9. AFFILIATE CODES TABLE
CREATE TABLE IF NOT EXISTS affiliate_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  affiliate_user_id UUID REFERENCES users(id),
  commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  commission_value DECIMAL(10,2) NOT NULL,
  usage_count INTEGER DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. AFFILIATE COMMISSIONS TABLE
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id UUID REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  affiliate_code_id UUID REFERENCES affiliate_codes(id),
  order_amount DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(4,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  payout_status TEXT CHECK (payout_status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  payout_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. USER SESSIONS TABLE
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  session_type TEXT CHECK (session_type IN ('guest', 'registered')) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. REVIEWS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  product_id UUID REFERENCES products(id),
  order_item_id UUID REFERENCES order_items(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  title TEXT,
  content TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_products_platform ON products(platform);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- RLS POLICIES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclaimers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Categories viewable by all" ON categories;
DROP POLICY IF EXISTS "Products viewable by all" ON products;
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- Create policies
CREATE POLICY "Categories viewable by all" ON categories FOR SELECT USING (true);
CREATE POLICY "Products viewable by all" ON products FOR SELECT USING (status = 'active');
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);