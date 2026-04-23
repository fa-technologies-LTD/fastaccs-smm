interface CloudinaryOptimizeOptions {
	width?: number;
}

const CLOUDINARY_HOST = 'res.cloudinary.com';
const IMAGE_UPLOAD_SEGMENT = '/image/upload/';

function clampWidth(value: number): number {
	if (!Number.isFinite(value)) return 720;
	return Math.min(Math.max(Math.round(value), 160), 2560);
}

export function buildCloudinaryOptimizedImageUrl(
	originalUrl: string,
	options: CloudinaryOptimizeOptions = {}
): string {
	if (typeof originalUrl !== 'string' || originalUrl.trim().length === 0) {
		return originalUrl;
	}

	try {
		const parsed = new URL(originalUrl);
		if (parsed.hostname !== CLOUDINARY_HOST) {
			return originalUrl;
		}

		const markerIndex = parsed.pathname.indexOf(IMAGE_UPLOAD_SEGMENT);
		if (markerIndex === -1) {
			return originalUrl;
		}

		const pathPrefix = parsed.pathname.slice(0, markerIndex + IMAGE_UPLOAD_SEGMENT.length);
		let pathSuffix = parsed.pathname.slice(markerIndex + IMAGE_UPLOAD_SEGMENT.length);
		const versionMatch = pathSuffix.match(/v\d+\//);

		if (versionMatch && typeof versionMatch.index === 'number' && versionMatch.index > 0) {
			pathSuffix = pathSuffix.slice(versionMatch.index);
		}

		const width = clampWidth(options.width ?? 720);
		const transformation = `f_auto,q_auto,dpr_auto,c_limit,w_${width}`;
		const normalizedSuffix = pathSuffix.replace(/^\/+/, '');

		parsed.pathname = `${pathPrefix}${transformation}/${normalizedSuffix}`;
		return parsed.toString();
	} catch {
		return originalUrl;
	}
}
