import { writable } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
	user: User | null;
	session: Session | null;
	loading: boolean;
}

export const initialAuthState: AuthState = {
	user: null,
	session: null,
	loading: true
};

export const auth = writable<AuthState>(initialAuthState);

// Helper functions
export const setAuth = (user: User | null, session: Session | null) => {
	auth.set({
		user,
		session,
		loading: false
	});
};

export const setLoading = (loading: boolean) => {
	auth.update((state) => ({ ...state, loading }));
};

export const clearAuth = () => {
	auth.set({
		user: null,
		session: null,
		loading: false
	});
};
