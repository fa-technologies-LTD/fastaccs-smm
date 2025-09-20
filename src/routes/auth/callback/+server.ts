import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('redirectTo') ?? '/dashboard';
	const error = url.searchParams.get('error');

	console.log('Auth callback - Code:', !!code, 'Error:', error, 'RedirectTo:', next);

	// If there's an error parameter from OAuth provider
	if (error) {
		console.error('OAuth provider error:', error);
		throw redirect(303, `/auth/login?error=${encodeURIComponent(error)}`);
	}

	if (code) {
		try {
			console.log('Attempting to exchange code for session...');
			const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

			if (exchangeError) {
				console.error('Auth callback error:', exchangeError);
				throw redirect(303, `/auth/login?error=${encodeURIComponent(exchangeError.message)}`);
			}

			if (data.session) {
				console.log('Session created successfully for user:', data.user?.email);
			}
		} catch (error) {
			console.error('Exception during auth callback:', error);
			const message = error instanceof Error ? error.message : 'Authentication failed';
			throw redirect(303, `/auth/login?error=${encodeURIComponent(message)}`);
		}
	} else {
		console.error('No authorization code received');
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('No authorization code received')}`
		);
	}

	console.log('Auth successful, redirecting to:', next);
	throw redirect(303, next);
};
