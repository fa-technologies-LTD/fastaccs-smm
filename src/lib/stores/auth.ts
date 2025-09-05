import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { supabase } from '$lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Tables } from '$lib/supabase';

interface AuthState {
	user: User | null;
	session: Session | null;
	profile: Tables<'users'> | null;
	loading: boolean;
	initialized: boolean;
}

const initialState: AuthState = {
	user: null,
	session: null,
	profile: null,
	loading: true,
	initialized: false
};

function createAuthStore() {
	const { subscribe, set } = writable<AuthState>(initialState);

	return {
		subscribe,

		// Initialize auth state
		async initialize() {
			// Only run in browser
			if (!browser) {
				set({
					user: null,
					session: null,
					profile: null,
					loading: false,
					initialized: true
				});
				return;
			}

			try {
				const {
					data: { session }
				} = await supabase.auth.getSession();

				if (session?.user) {
					await this.setSession(session);
				} else {
					set({
						user: null,
						session: null,
						profile: null,
						loading: false,
						initialized: true
					});
				}

				// Listen for auth changes
				supabase.auth.onAuthStateChange(async (event, session) => {
					if (session?.user) {
						await this.setSession(session);
					} else {
						this.signOut(false); // Don't call supabase.auth.signOut() since it's already signed out
					}
				});
			} catch (error) {
				console.error('Auth initialization error:', error);
				set({
					user: null,
					session: null,
					profile: null,
					loading: false,
					initialized: true
				});
			}
		},

		// Set session and load profile
		async setSession(session: Session) {
			const user = session.user;

			try {
				// Load user profile from our database
				const { data: profile, error } = await supabase
					.from('users')
					.select('*')
					.or(`google_id.eq.${user.id},email.eq.${user.email}`)
					.single();

				if (error && error.code !== 'PGRST116') {
					// Not found error
					console.error('Profile load error:', error);
				}

				set({
					user,
					session,
					profile: profile || null,
					loading: false,
					initialized: true
				});
			} catch (error) {
				console.error('Profile load error:', error);
				set({
					user,
					session,
					profile: null,
					loading: false,
					initialized: true
				});
			}
		},

		// Sign in with Google
		async signInWithGoogle(redirectTo = '/dashboard') {
			// Only run in browser
			if (!browser) {
				throw new Error('Google sign-in can only be initiated in the browser');
			}

			const { data, error } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
				}
			});

			if (error) {
				throw error;
			}

			return data;
		},

		// Sign out
		async signOut(callSupabase = true) {
			if (callSupabase) {
				const { error } = await supabase.auth.signOut();
				if (error) {
					throw error;
				}
			}

			set({
				user: null,
				session: null,
				profile: null,
				loading: false,
				initialized: true
			});
		},

		// Check if user is authenticated
		isAuthenticated(): boolean {
			let currentState: AuthState;
			const unsubscribe = subscribe((state) => {
				currentState = state;
			});
			unsubscribe();

			return !!(currentState!.user && currentState!.session);
		},

		// Get current user
		getUser(): User | null {
			let currentState: AuthState;
			const unsubscribe = subscribe((state) => {
				currentState = state;
			});
			unsubscribe();

			return currentState!.user;
		},

		// Get current profile
		getProfile(): Tables<'users'> | null {
			let currentState: AuthState;
			const unsubscribe = subscribe((state) => {
				currentState = state;
			});
			unsubscribe();

			return currentState!.profile;
		}
	};
}

export const auth = createAuthStore();
