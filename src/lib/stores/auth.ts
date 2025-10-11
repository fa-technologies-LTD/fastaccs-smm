import { writable } from 'svelte/store';

import type { UserType } from '@prisma/client';

export interface User {
	id: string;
	email: string | null;
	fullName: string | null;
	avatarUrl: string | null;
	userType: UserType;
	isActive: boolean;
	emailVerified: boolean;
}

export interface Session {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	user: User;
}

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
