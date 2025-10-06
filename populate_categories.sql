-- FastAccs Categories Population SQL
-- Run this to populate the categories table with platforms and tiers

-- First, insert the main platforms
INSERT INTO categories (id, parent_id, name, slug, description, category_type, metadata, sort_order, is_active, created_at, updated_at)
VALUES 
-- Social Media Platforms
(gen_random_uuid(), NULL, 'Instagram', 'instagram', 'Instagram social media accounts with various follower counts and engagement rates', 'platform', 
 '{"icon": "instagram", "color": "#E4405F", "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/240px-Instagram_icon.png", "website_url": "https://instagram.com", "platform_info": {"followers_range": [100, 1000000], "content_types": ["photos", "stories", "reels", "igtv"], "demographics": ["general", "lifestyle", "business"]}}', 
 1, true, NOW(), NOW()),

(gen_random_uuid(), NULL, 'TikTok', 'tiktok', 'TikTok accounts with high engagement and viral potential', 'platform',
 '{"icon": "music", "color": "#000000", "logo_url": "https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/tiktok/webapp/main/webapp-desktop/8152caf0c8e8bc67ae0d.png", "website_url": "https://tiktok.com", "platform_info": {"followers_range": [1000, 5000000], "content_types": ["short_videos", "live_streams"], "demographics": ["gen_z", "millennials", "entertainment"]}}',
 2, true, NOW(), NOW()),

(gen_random_uuid(), NULL, 'YouTube', 'youtube', 'YouTube channels with subscribers and monetization potential', 'platform',
 '{"icon": "youtube", "color": "#FF0000", "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/YouTube_full-color_icon_%282017%29.svg/240px-YouTube_full-color_icon_%282017%29.svg.png", "website_url": "https://youtube.com", "platform_info": {"followers_range": [100, 10000000], "content_types": ["videos", "shorts", "live_streams"], "demographics": ["all_ages", "educational", "entertainment"]}}',
 3, true, NOW(), NOW()),

(gen_random_uuid(), NULL, 'Facebook', 'facebook', 'Facebook pages and profiles with established audiences', 'platform',
 '{"icon": "facebook", "color": "#1877F2", "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Facebook_f_logo_%282019%29.svg/240px-Facebook_f_logo_%282019%29.svg.png", "website_url": "https://facebook.com", "platform_info": {"followers_range": [500, 2000000], "content_types": ["posts", "stories", "pages", "groups"], "demographics": ["millennials", "gen_x", "business"]}}',
 4, true, NOW(), NOW()),

(gen_random_uuid(), NULL, 'Twitter', 'twitter', 'Twitter/X accounts with active engagement and follower bases', 'platform',
 '{"icon": "twitter", "color": "#1DA1F2", "logo_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_of_Twitter.svg/240px-Logo_of_Twitter.svg.png", "website_url": "https://twitter.com", "platform_info": {"followers_range": [100, 5000000], "content_types": ["tweets", "threads", "spaces"], "demographics": ["professionals", "news", "tech"]}}',
 5, true, NOW(), NOW());

-- Now insert tiers for each platform
-- We'll use CTEs to get the platform IDs and create tiers

WITH platform_ids AS (
  SELECT id, slug FROM categories WHERE category_type = 'platform'
)

-- Instagram Tiers
INSERT INTO categories (id, parent_id, name, slug, description, category_type, metadata, sort_order, is_active, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  p.id,
  tier_data.name,
  tier_data.slug,
  tier_data.description,
  'tier',
  tier_data.metadata::jsonb,
  tier_data.sort_order,
  true,
  NOW(),
  NOW()
FROM platform_ids p
CROSS JOIN (
  VALUES 
    ('Instagram Starter', 'instagram-starter', 'Small Instagram accounts perfect for beginners', '{"price": 2500, "currency": "NGN", "followers_range": [100, 1000], "engagement_rate": [1, 3], "age_months": [1, 6], "features": ["basic_followers", "organic_growth", "real_accounts"]}', 1),
    ('Instagram Growth', 'instagram-growth', 'Medium-sized accounts with good engagement', '{"price": 5000, "currency": "NGN", "followers_range": [1000, 10000], "engagement_rate": [2, 5], "age_months": [3, 12], "features": ["verified_email", "phone_verified", "moderate_engagement"]}', 2),
    ('Instagram Pro', 'instagram-pro', 'High-quality accounts with strong follower base', '{"price": 10000, "currency": "NGN", "followers_range": [10000, 50000], "engagement_rate": [3, 7], "age_months": [6, 24], "features": ["high_engagement", "business_ready", "aged_account"]}', 3),
    ('Instagram Elite', 'instagram-elite', 'Premium accounts with massive reach', '{"price": 25000, "currency": "NGN", "followers_range": [50000, 200000], "engagement_rate": [4, 8], "age_months": [12, 36], "features": ["influencer_ready", "brand_partnerships", "premium_content"]}', 4)
) AS tier_data(name, slug, description, metadata, sort_order)
WHERE p.slug = 'instagram'

UNION ALL

-- TikTok Tiers  
SELECT 
  gen_random_uuid(),
  p.id,
  tier_data.name,
  tier_data.slug,
  tier_data.description,
  'tier',
  tier_data.metadata::jsonb,
  tier_data.sort_order,
  true,
  NOW(),
  NOW()
FROM platform_ids p
CROSS JOIN (
  VALUES 
    ('TikTok Fresh', 'tiktok-fresh', 'New TikTok accounts ready for content creation', '{"price": 3000, "currency": "NGN", "followers_range": [500, 2000], "engagement_rate": [5, 10], "age_months": [1, 3], "features": ["fresh_account", "no_violations", "clean_history"]}', 1),
    ('TikTok Viral', 'tiktok-viral', 'Accounts with viral potential and good reach', '{"price": 7500, "currency": "NGN", "followers_range": [2000, 15000], "engagement_rate": [8, 15], "age_months": [2, 8], "features": ["viral_ready", "algorithm_friendly", "trend_participation"]}', 2),
    ('TikTok Creator', 'tiktok-creator', 'Established creator accounts with strong engagement', '{"price": 15000, "currency": "NGN", "followers_range": [15000, 100000], "engagement_rate": [10, 20], "age_months": [6, 18], "features": ["creator_fund_eligible", "brand_collaborations", "consistent_views"]}', 3),
    ('TikTok Influencer', 'tiktok-influencer', 'Top-tier influencer accounts with massive reach', '{"price": 35000, "currency": "NGN", "followers_range": [100000, 1000000], "engagement_rate": [12, 25], "age_months": [12, 30], "features": ["influencer_status", "brand_partnerships", "viral_content"]}', 4)
) AS tier_data(name, slug, description, metadata, sort_order)
WHERE p.slug = 'tiktok'

UNION ALL

-- YouTube Tiers
SELECT 
  gen_random_uuid(),
  p.id,
  tier_data.name,
  tier_data.slug,
  tier_data.description,
  'tier',
  tier_data.metadata::jsonb,
  tier_data.sort_order,
  true,
  NOW(),
  NOW()
FROM platform_ids p
CROSS JOIN (
  VALUES 
    ('YouTube Starter', 'youtube-starter', 'Small YouTube channels perfect for new creators', '{"price": 4000, "currency": "NGN", "followers_range": [100, 1000], "engagement_rate": [2, 5], "age_months": [1, 6], "features": ["monetization_ready", "custom_url", "basic_analytics"]}', 1),
    ('YouTube Creator', 'youtube-creator', 'Growing channels with consistent viewership', '{"price": 8000, "currency": "NGN", "followers_range": [1000, 10000], "engagement_rate": [3, 8], "age_months": [3, 12], "features": ["monetization_enabled", "community_tab", "custom_thumbnail"]}', 2),
    ('YouTube Pro', 'youtube-pro', 'Established channels with strong subscriber base', '{"price": 18000, "currency": "NGN", "followers_range": [10000, 100000], "engagement_rate": [4, 10], "age_months": [6, 24], "features": ["brand_partnerships", "merchandise_shelf", "live_streaming"]}', 3),
    ('YouTube Authority', 'youtube-authority', 'Authority channels with massive subscriber counts', '{"price": 45000, "currency": "NGN", "followers_range": [100000, 1000000], "engagement_rate": [5, 12], "age_months": [12, 48], "features": ["authority_status", "premium_features", "industry_recognition"]}', 4)
) AS tier_data(name, slug, description, metadata, sort_order)
WHERE p.slug = 'youtube'

UNION ALL

-- Facebook Tiers
SELECT 
  gen_random_uuid(),
  p.id,
  tier_data.name,
  tier_data.slug,
  tier_data.description,
  'tier',
  tier_data.metadata::jsonb,
  tier_data.sort_order,
  true,
  NOW(),
  NOW()
FROM platform_ids p
CROSS JOIN (
  VALUES 
    ('Facebook Basic', 'facebook-basic', 'Basic Facebook pages with growing audience', '{"price": 2000, "currency": "NGN", "followers_range": [500, 2000], "engagement_rate": [1, 4], "age_months": [2, 8], "features": ["page_verified", "basic_insights", "post_scheduling"]}', 1),
    ('Facebook Business', 'facebook-business', 'Business-ready pages with established presence', '{"price": 5500, "currency": "NGN", "followers_range": [2000, 15000], "engagement_rate": [2, 6], "age_months": [6, 18], "features": ["business_verified", "ads_eligible", "messenger_integration"]}', 2),
    ('Facebook Premium', 'facebook-premium', 'Premium pages with strong community engagement', '{"price": 12000, "currency": "NGN", "followers_range": [15000, 75000], "engagement_rate": [3, 8], "age_months": [12, 30], "features": ["community_building", "event_hosting", "advanced_analytics"]}', 3),
    ('Facebook Enterprise', 'facebook-enterprise', 'Enterprise-level pages for major brands', '{"price": 28000, "currency": "NGN", "followers_range": [75000, 500000], "engagement_rate": [4, 10], "age_months": [18, 60], "features": ["enterprise_features", "api_access", "dedicated_support"]}', 4)
) AS tier_data(name, slug, description, metadata, sort_order)
WHERE p.slug = 'facebook'

UNION ALL

-- Twitter Tiers
SELECT 
  gen_random_uuid(),
  p.id,
  tier_data.name,
  tier_data.slug,
  tier_data.description,
  'tier',
  tier_data.metadata::jsonb,
  tier_data.sort_order,
  true,
  NOW(),
  NOW()
FROM platform_ids p
CROSS JOIN (
  VALUES 
    ('Twitter Starter', 'twitter-starter', 'New Twitter accounts with growing followers', '{"price": 1500, "currency": "NGN", "followers_range": [100, 1000], "engagement_rate": [2, 5], "age_months": [1, 4], "features": ["verified_email", "phone_verified", "clean_history"]}', 1),
    ('Twitter Growth', 'twitter-growth', 'Active accounts with good engagement rates', '{"price": 4000, "currency": "NGN", "followers_range": [1000, 8000], "engagement_rate": [3, 7], "age_months": [3, 12], "features": ["active_engagement", "retweet_network", "hashtag_reach"]}', 2),
    ('Twitter Influence', 'twitter-influence', 'Influential accounts with strong follower base', '{"price": 9000, "currency": "NGN", "followers_range": [8000, 50000], "engagement_rate": [4, 9], "age_months": [6, 24], "features": ["thought_leadership", "industry_recognition", "media_mentions"]}', 3),
    ('Twitter Authority', 'twitter-authority', 'Authority accounts with massive reach', '{"price": 22000, "currency": "NGN", "followers_range": [50000, 300000], "engagement_rate": [5, 12], "age_months": [12, 36], "features": ["authority_status", "media_coverage", "influencer_network"]}', 4)
) AS tier_data(name, slug, description, metadata, sort_order)
WHERE p.slug = 'twitter';

-- Display the created categories structure
SELECT 
  'SUMMARY' as type,
  COUNT(*) as total_categories,
  COUNT(*) FILTER (WHERE category_type = 'platform') as platforms,
  COUNT(*) FILTER (WHERE category_type = 'tier') as tiers
FROM categories
WHERE is_active = true;

-- Show the platform and tier structure
SELECT 
  p.name as platform,
  p.slug as platform_slug,
  COUNT(t.id) as tier_count
FROM categories p
LEFT JOIN categories t ON t.parent_id = p.id AND t.category_type = 'tier'
WHERE p.category_type = 'platform' AND p.is_active = true
GROUP BY p.id, p.name, p.slug
ORDER BY p.sort_order;