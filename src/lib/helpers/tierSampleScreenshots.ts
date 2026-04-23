export const TIER_SAMPLE_SCREENSHOTS_KEY = 'sample_screenshot_urls';
export const MAX_TIER_SAMPLE_SCREENSHOTS = 3;

function isAllowedScreenshotUrl(value: string): boolean {
	if (value.startsWith('/')) {
		return true;
	}

	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
}

export function sanitizeTierSampleScreenshotUrls(input: unknown): string[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const normalized = input
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter((value) => value.length > 0 && isAllowedScreenshotUrl(value));

	return Array.from(new Set(normalized)).slice(0, MAX_TIER_SAMPLE_SCREENSHOTS);
}

export function getTierSampleScreenshotUrls(metadata: unknown): string[] {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return [];
	}

	const objectMetadata = metadata as Record<string, unknown>;
	return sanitizeTierSampleScreenshotUrls(objectMetadata[TIER_SAMPLE_SCREENSHOTS_KEY]);
}

export function applyTierSampleScreenshotSanitization(
	metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	const safeMetadata = metadata ? { ...metadata } : {};
	const sanitizedUrls = sanitizeTierSampleScreenshotUrls(safeMetadata[TIER_SAMPLE_SCREENSHOTS_KEY]);

	if (sanitizedUrls.length === 0) {
		delete safeMetadata[TIER_SAMPLE_SCREENSHOTS_KEY];
	} else {
		safeMetadata[TIER_SAMPLE_SCREENSHOTS_KEY] = sanitizedUrls;
	}

	return safeMetadata;
}
