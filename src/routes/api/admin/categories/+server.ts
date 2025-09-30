import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Create admin client with service role key
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

export const GET: RequestHandler = async ({ url }: { url: URL }) => {
	try {
		console.log('🔍 GET /api/admin/categories called');
		console.log('🔑 Service role key exists:', !!SUPABASE_SERVICE_ROLE_KEY);
		console.log('🔑 Service role key length:', SUPABASE_SERVICE_ROLE_KEY?.length);

		const categoryType = url.searchParams.get('category_type');
		const parentId = url.searchParams.get('parent_id');

		console.log('📊 Query params:', { categoryType, parentId });

		let query = supabaseAdmin
			.from('categories')
			.select('*')
			.eq('is_active', true)
			.order('sort_order');

		if (categoryType) {
			query = query.eq('category_type', categoryType);
		}

		if (parentId) {
			query = query.eq('parent_id', parentId);
		}

		console.log('🚀 Executing query...');
		const { data, error } = await query;

		if (error) {
			console.error('❌ Category fetch error:', error);
			console.error('❌ Error details:', JSON.stringify(error, null, 2));
			return json({ error: error.message }, { status: 400 });
		}

		console.log('✅ Query successful, data length:', data?.length);
		return json({ data });
	} catch (err) {
		console.error('💥 API error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
export const POST: RequestHandler = async ({ request }: { request: Request }) => {
	try {
		const body = await request.json();

		// Insert the category using admin client
		const { data, error } = await supabaseAdmin.from('categories').insert(body).select().single();

		if (error) {
			console.error('Category creation error:', error);
			return json({ error: error.message }, { status: 400 });
		}

		return json({ data });
	} catch (err) {
		console.error('API error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ url }: { url: URL }) => {
	try {
		const id = url.searchParams.get('id');

		if (!id) {
			return json({ error: 'Category ID is required' }, { status: 400 });
		}

		console.log('🗑️ DELETE /api/admin/categories called with id:', id);
		console.log('🔍 Service role key exists:', !!SUPABASE_SERVICE_ROLE_KEY);

		// First check if the category exists
		const { data: existingCategory, error: fetchError } = await supabaseAdmin
			.from('categories')
			.select('id')
			.eq('id', id)
			.single();

		if (fetchError) {
			console.error('❌ Category fetch error:', fetchError);
			return json({ error: `Category not found: ${fetchError.message}` }, { status: 404 });
		}

		console.log('📦 Found category to delete:', existingCategory);

		// Try different approach - use match instead of eq
		console.log('🔄 Attempting delete with match clause...');
		const { data: deletedData, error } = await supabaseAdmin
			.from('categories')
			.delete()
			.match({ id: id })
			.select();

		if (error) {
			console.error('❌ Category deletion error with match:', error);

			// Try with filter as backup
			console.log('🔄 Attempting delete with filter clause...');
			const { data: deletedData2, error: error2 } = await supabaseAdmin
				.from('categories')
				.delete()
				.filter('id', 'eq', id)
				.select();

			if (error2) {
				console.error('❌ Category deletion error with filter:', error2);
				return json({ error: error2.message }, { status: 400 });
			}

			console.log('📦 Deleted category data with filter:', deletedData2);
			return json({ success: true });
		}

		console.log('📦 Deleted category data with match:', deletedData);

		console.log('✅ Category deleted successfully');
		return json({ success: true });
	} catch (err) {
		console.error('💥 API error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
