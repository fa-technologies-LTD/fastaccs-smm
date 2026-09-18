export type ReviewBlockKind =
	| 'heading'
	| 'paragraph'
	| 'note'
	| 'list'
	| 'table'
	| 'code'
	| 'quote'
	| 'rule';

export interface ReviewListItem {
	text: string;
	checked?: boolean;
}

export interface ReviewBlock {
	id: string;
	kind: ReviewBlockKind;
	lineStart: number;
	lineEnd: number;
	plainText: string;
	text?: string;
	level?: number;
	ordered?: boolean;
	items?: ReviewListItem[];
	headers?: string[];
	rows?: string[][];
	language?: string;
}

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[`*_#[\]()]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'block'
	);
}

function isRule(line: string): boolean {
	return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isHeading(line: string): boolean {
	return /^#{1,6}\s+/.test(line);
}

function listMatch(line: string): RegExpMatchArray | null {
	return line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
}

function splitTableRow(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
	const cells = splitTableRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], index: number): boolean {
	return Boolean(
		lines[index]?.includes('|') && lines[index + 1] && isTableDivider(lines[index + 1])
	);
}

function isOwnerNote(text: string): boolean {
	const trimmed = text.trim();
	if (/^\(.+\)$/.test(trimmed)) return true;
	if (trimmed.includes('-->') || trimmed.includes('<--')) return true;
	return /^AS SIMPLE AS POSSIBLE\b/.test(trimmed);
}

function startsBlock(lines: string[], index: number): boolean {
	const line = lines[index] || '';
	return (
		!line.trim() ||
		line.trimStart().startsWith('```') ||
		isHeading(line) ||
		isRule(line) ||
		Boolean(listMatch(line)) ||
		/^\s*>\s?/.test(line) ||
		isTableStart(lines, index)
	);
}

export function parseReviewMarkdown(source: string, documentId: string): ReviewBlock[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const blocks: ReviewBlock[] = [];
	let index = 0;
	let section = documentId;
	const idCounts = new Map<string, number>();

	const addBlock = (block: Omit<ReviewBlock, 'id'>) => {
		const base = `${documentId}-${slugify(section)}-${slugify(block.plainText)}-${stableHash(block.plainText)}`;
		const count = idCounts.get(base) || 0;
		idCounts.set(base, count + 1);
		blocks.push({ ...block, id: count ? `${base}-${count + 1}` : base });
	};

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}

		if (line.trimStart().startsWith('```')) {
			const start = index;
			const language = line.trim().slice(3).trim();
			index += 1;
			const codeLines: string[] = [];
			while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
				codeLines.push(lines[index]);
				index += 1;
			}
			if (index < lines.length) index += 1;
			const text = codeLines.join('\n');
			addBlock({
				kind: 'code',
				lineStart: start + 1,
				lineEnd: index,
				plainText: text,
				text,
				language
			});
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/);
		if (heading) {
			const text = heading[2].trim();
			section = text;
			addBlock({
				kind: 'heading',
				lineStart: index + 1,
				lineEnd: index + 1,
				plainText: text,
				text,
				level: heading[1].length
			});
			index += 1;
			continue;
		}

		if (isRule(line)) {
			addBlock({
				kind: 'rule',
				lineStart: index + 1,
				lineEnd: index + 1,
				plainText: 'Section break'
			});
			index += 1;
			continue;
		}

		if (isTableStart(lines, index)) {
			const start = index;
			const headers = splitTableRow(lines[index]);
			index += 2;
			const rows: string[][] = [];
			while (index < lines.length && lines[index].trim().startsWith('|')) {
				rows.push(splitTableRow(lines[index]));
				index += 1;
			}
			const plainText = [headers, ...rows].flat().join(' · ');
			addBlock({
				kind: 'table',
				lineStart: start + 1,
				lineEnd: index,
				plainText,
				headers,
				rows
			});
			continue;
		}

		const firstListItem = listMatch(line);
		if (firstListItem) {
			const start = index;
			const ordered = Boolean(firstListItem[2]);
			const items: ReviewListItem[] = [];
			while (index < lines.length) {
				const match = listMatch(lines[index]);
				if (!match || Boolean(match[2]) !== ordered) break;
				const rawText = match[3].trim();
				const checkbox = rawText.match(/^\[([ xX])\]\s+(.+)$/);
				items.push(
					checkbox
						? { text: checkbox[2], checked: checkbox[1].toLowerCase() === 'x' }
						: { text: rawText }
				);
				index += 1;
			}
			addBlock({
				kind: 'list',
				lineStart: start + 1,
				lineEnd: index,
				plainText: items.map((item) => item.text).join(' · '),
				items,
				ordered
			});
			continue;
		}

		if (/^\s*>\s?/.test(line)) {
			const start = index;
			const quoteLines: string[] = [];
			while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
				quoteLines.push(lines[index].replace(/^\s*>\s?/, '').trim());
				index += 1;
			}
			const text = quoteLines.join(' ');
			addBlock({
				kind: 'quote',
				lineStart: start + 1,
				lineEnd: index,
				plainText: text,
				text
			});
			continue;
		}

		const start = index;
		const paragraphLines = [line.trim()];
		index += 1;
		while (index < lines.length && !startsBlock(lines, index)) {
			paragraphLines.push(lines[index].trim());
			index += 1;
		}
		const text = paragraphLines.join(' ');
		addBlock({
			kind: isOwnerNote(text) ? 'note' : 'paragraph',
			lineStart: start + 1,
			lineEnd: index,
			plainText: text,
			text
		});
	}

	return blocks;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function safeLink(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
	} catch {
		return null;
	}
}

export function renderReviewInlineMarkdown(value: string): string {
	const tokens: string[] = [];
	const token = (html: string) => {
		const marker = `@@FASTACCS_REVIEW_TOKEN_${tokens.length}@@`;
		tokens.push(html);
		return marker;
	};

	let rendered = escapeHtml(value);
	rendered = rendered.replace(/`([^`]+)`/g, (_match, code: string) =>
		token(`<code>${code}</code>`)
	);
	rendered = rendered.replace(
		/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g,
		(_match, label: string, rawUrl: string) => {
			const url = safeLink(rawUrl);
			return url
				? token(`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>`)
				: `${label} (${rawUrl})`;
		}
	);
	rendered = rendered.replace(/https?:\/\/[^\s<]+/g, (rawUrl) => {
		const trailing = rawUrl.match(/[.,;:!?]+$/)?.[0] || '';
		const cleanUrl = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
		const url = safeLink(cleanUrl);
		return url
			? `${token(`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${cleanUrl}</a>`)}${trailing}`
			: rawUrl;
	});
	rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	rendered = rendered.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

	return tokens.reduce((result, html, index) => {
		return result.replaceAll(`@@FASTACCS_REVIEW_TOKEN_${index}@@`, html);
	}, rendered);
}
