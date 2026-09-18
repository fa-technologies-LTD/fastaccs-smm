import { describe, expect, it } from 'vitest';
import { parseReviewMarkdown, renderReviewInlineMarkdown } from './planning-review-markdown';

describe('planning review markdown', () => {
	it('turns headings, checklists, tables and code into stable review blocks', () => {
		const markdown = `# Plan

- [x] Done
- [ ] Next

| Item | State |
| --- | --- |
| API | Read only |

\`\`\`ts
const ready = true;
\`\`\``;
		const blocks = parseReviewMarkdown(markdown, 'plan');

		expect(blocks.map((block) => block.kind)).toEqual(['heading', 'list', 'table', 'code']);
		expect(blocks[1].items).toEqual([
			{ text: 'Done', checked: true },
			{ text: 'Next', checked: false }
		]);
		expect(blocks[2].rows).toEqual([['API', 'Read only']]);
		expect(parseReviewMarkdown(markdown, 'plan').map((block) => block.id)).toEqual(
			blocks.map((block) => block.id)
		);
	});

	it('recognizes owner notes without mistaking ordinary paragraphs for them', () => {
		const blocks = parseReviewMarkdown(
			'(make this clearer)\n\nThis is regular copy.\n\nAS SIMPLE AS POSSIBLE, everywhere.',
			'plan'
		);

		expect(blocks.map((block) => block.kind)).toEqual(['note', 'paragraph', 'note']);
	});

	it('escapes unsafe HTML while preserving safe inline formatting and links', () => {
		const rendered = renderReviewInlineMarkdown(
			'<script>alert(1)</script> **safe** `code` https://example.com'
		);

		expect(rendered).not.toContain('<script>');
		expect(rendered).toContain('&lt;script&gt;');
		expect(rendered).toContain('<strong>safe</strong>');
		expect(rendered).toContain('<code>code</code>');
		expect(rendered).toContain('href="https://example.com/"');
	});
});
