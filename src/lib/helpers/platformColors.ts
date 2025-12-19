import { Instagram, Music, Facebook, Twitter, Package } from '@lucide/svelte';
import type { Component } from 'svelte';

// Platform icons mapping
const platformIcons: Record<string, Component> = {
	instagram: Instagram,
	tiktok: Music,
	facebook: Facebook,
	twitter: Twitter
};

// Platform colors
const platformColors: Record<string, string> = {
	instagram: 'from-pink-500 to-purple-600',
	tiktok: 'from-black to-gray-800',
	facebook: 'from-blue-600 to-blue-700',
	twitter: 'from-blue-400 to-blue-500'
};

function getPlatformIcon(platform: string) {
	return platformIcons[platform.toLowerCase()] || Package;
}

function getPlatformColor(platform: string): string {
	return platformColors[platform.toLowerCase()] || 'from-gray-500 to-gray-600';
}

export { getPlatformIcon, getPlatformColor };
