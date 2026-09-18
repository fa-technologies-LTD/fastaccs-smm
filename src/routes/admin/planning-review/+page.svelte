<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { dev } from '$app/environment';
	import {
		Check,
		CheckCircle,
		Copy,
		Download,
		FileText,
		MessageSquare,
		Search,
		Trash2,
		X
	} from '$lib/icons';
	import {
		parseReviewMarkdown,
		renderReviewInlineMarkdown,
		type ReviewBlock
	} from '$lib/helpers/planning-review-markdown';

	interface ReviewPageData {
		planMarkdown: string;
		todoMarkdown: string;
	}

	type DocumentId = 'plan' | 'todo';

	interface ReviewDocument {
		id: DocumentId;
		label: string;
		description: string;
		blocks: ReviewBlock[];
	}

	interface ReviewComment {
		id: string;
		documentId: DocumentId;
		blockId: string;
		blockExcerpt: string;
		lineStart: number;
		text: string;
		createdAt: string;
		resolved: boolean;
	}

	let { data }: { data: ReviewPageData } = $props();

	const STORAGE_KEY = 'fastaccs:planning-review-comments:v1';
	const documents: ReviewDocument[] = $derived([
		{
			id: 'plan',
			label: 'Boosting plan',
			description: 'Architecture, safeguards, customer experience and rollout',
			blocks: parseReviewMarkdown(data.planMarkdown, 'plan')
		},
		{
			id: 'todo',
			label: 'Project to-do',
			description: 'The live checklist across completed, paused and future work',
			blocks: parseReviewMarkdown(data.todoMarkdown, 'todo')
		}
	]);

	let activeDocumentId = $state<DocumentId>('plan');
	let selectedBlockId = $state<string | null>(null);
	let comments = $state<ReviewComment[]>([]);
	let draft = $state('');
	let searchQuery = $state('');
	let showResolved = $state(false);
	let mobileCommentsOpen = $state(false);
	let copyStatus = $state('');
	let commentInput = $state<HTMLTextAreaElement>();
	let copyStatusTimer: ReturnType<typeof setTimeout> | null = null;

	const activeDocument = $derived(
		documents.find((document) => document.id === activeDocumentId) ?? documents[0]
	);
	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const visibleBlocks = $derived(
		normalizedSearch
			? activeDocument.blocks.filter((block) =>
					block.plainText.toLowerCase().includes(normalizedSearch)
				)
			: activeDocument.blocks
	);
	const outline = $derived(
		activeDocument.blocks.filter((block) => block.kind === 'heading' && (block.level || 1) <= 3)
	);
	const activeComments = $derived(
		comments.filter(
			(comment) => comment.documentId === activeDocumentId && (showResolved || !comment.resolved)
		)
	);
	const unresolvedCount = $derived(
		comments.filter((comment) => comment.documentId === activeDocumentId && !comment.resolved)
			.length
	);
	const selectedBlock = $derived(
		activeDocument.blocks.find((block) => block.id === selectedBlockId) ?? null
	);
	const selectedComments = $derived(
		selectedBlockId
			? comments.filter(
					(comment) =>
						comment.documentId === activeDocumentId && comment.blockId === selectedBlockId
				)
			: []
	);
	const checklistProgress = $derived.by(() => {
		const items = activeDocument.blocks
			.flatMap((block) => block.items || [])
			.filter((item) => item.checked !== undefined);
		return {
			complete: items.filter((item) => item.checked).length,
			total: items.length
		};
	});

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return;
			comments = parsed.filter(isReviewComment);
			void syncDevelopmentComments(comments);
		} catch {
			comments = [];
		}
	});

	function isReviewComment(value: unknown): value is ReviewComment {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		const record = value as Record<string, unknown>;
		return (
			typeof record.id === 'string' &&
			(record.documentId === 'plan' || record.documentId === 'todo') &&
			typeof record.blockId === 'string' &&
			typeof record.blockExcerpt === 'string' &&
			typeof record.lineStart === 'number' &&
			typeof record.text === 'string' &&
			typeof record.createdAt === 'string' &&
			typeof record.resolved === 'boolean'
		);
	}

	function persistComments(nextComments: ReviewComment[]) {
		comments = nextComments;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(nextComments));
		void syncDevelopmentComments(nextComments);
	}

	async function syncDevelopmentComments(nextComments: ReviewComment[]) {
		if (!dev || !nextComments.length) return;
		try {
			await fetch('/api/dev/planning-comments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ comments: nextComments })
			});
		} catch {
			// The browser copy remains authoritative if the local sync is unavailable.
		}
	}

	function setDocument(documentId: DocumentId) {
		activeDocumentId = documentId;
		selectedBlockId = null;
		searchQuery = '';
		draft = '';
		mobileCommentsOpen = false;
	}

	async function selectBlock(blockId: string) {
		selectedBlockId = blockId;
		mobileCommentsOpen = true;
		await tick();
		commentInput?.focus({ preventScroll: true });
	}

	function handleBlockKeydown(event: KeyboardEvent, blockId: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void selectBlock(blockId);
	}

	function scrollToBlock(blockId: string) {
		const element = document.getElementById(`review-${blockId}`);
		element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		void selectBlock(blockId);
	}

	function commentsForBlock(blockId: string): ReviewComment[] {
		return comments.filter(
			(comment) => comment.documentId === activeDocumentId && comment.blockId === blockId
		);
	}

	function addComment() {
		const text = draft.trim();
		if (!selectedBlock || !text) return;
		const next: ReviewComment = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			documentId: activeDocumentId,
			blockId: selectedBlock.id,
			blockExcerpt: selectedBlock.plainText.slice(0, 240),
			lineStart: selectedBlock.lineStart,
			text,
			createdAt: new Date().toISOString(),
			resolved: false
		};
		persistComments([...comments, next]);
		draft = '';
	}

	function toggleResolved(commentId: string) {
		persistComments(
			comments.map((comment) =>
				comment.id === commentId ? { ...comment, resolved: !comment.resolved } : comment
			)
		);
	}

	function deleteComment(commentId: string) {
		persistComments(comments.filter((comment) => comment.id !== commentId));
	}

	async function openComment(comment: ReviewComment) {
		if (comment.documentId !== activeDocumentId) setDocument(comment.documentId);
		await tick();
		scrollToBlock(comment.blockId);
	}

	function buildCommentExport(): string {
		const rows = comments
			.slice()
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
		const output = ['# Fast Accounts planning review', ''];
		if (!rows.length) return `${output.join('\n')}No comments yet.\n`;

		for (const reviewDocument of documents) {
			const documentComments = rows.filter((comment) => comment.documentId === reviewDocument.id);
			if (!documentComments.length) continue;
			output.push(`## ${reviewDocument.label}`, '');
			for (const comment of documentComments) {
				output.push(
					`### Line ${comment.lineStart} · ${comment.resolved ? 'Resolved' : 'Open'}`,
					'',
					`> ${comment.blockExcerpt.replaceAll('\n', ' ')}`,
					'',
					comment.text,
					''
				);
			}
		}
		return `${output.join('\n').trim()}\n`;
	}

	function showCopyStatus(message: string) {
		copyStatus = message;
		if (copyStatusTimer) clearTimeout(copyStatusTimer);
		copyStatusTimer = setTimeout(() => (copyStatus = ''), 2200);
	}

	async function copyComments() {
		try {
			await navigator.clipboard.writeText(buildCommentExport());
			showCopyStatus('Comments copied');
		} catch {
			showCopyStatus('Copy failed—use Export');
		}
	}

	function downloadComments() {
		const blob = new Blob([buildCommentExport()], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'fastaccs-planning-comments.md';
		anchor.click();
		URL.revokeObjectURL(url);
		showCopyStatus('Comments exported');
	}

	function formatCommentDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat('en-NG', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}
</script>

<svelte:head>
	<title>Planning Review - Fast Accounts</title>
	<meta
		name="description"
		content="Private Fast Accounts planning documents and local review comments."
	/>
</svelte:head>

<div class="review-page">
	<header class="review-hero">
		<div class="hero-copy">
			<div class="eyebrow"><FileText size={15} /> Planning room</div>
			<h1>Read it. Click it. Leave your thought.</h1>
			<p>
				Every paragraph, table and task is commentable. Notes stay in this browser until you copy or
				export them.
			</p>
		</div>
		<div class="hero-actions">
			<div class="local-badge"><span></span> Saved on this device</div>
			<button
				class="action-button"
				type="button"
				onclick={copyComments}
				disabled={!comments.length}
			>
				<Copy size={16} /> Copy notes
			</button>
			<button
				class="action-button primary"
				type="button"
				onclick={downloadComments}
				disabled={!comments.length}
			>
				<Download size={16} /> Export
			</button>
		</div>
	</header>

	{#if copyStatus}
		<div class="copy-toast" role="status">{copyStatus}</div>
	{/if}

	<section class="review-toolbar" aria-label="Planning documents">
		<div class="document-tabs">
			{#each documents as reviewDocument (reviewDocument.id)}
				<button
					type="button"
					class:active={activeDocumentId === reviewDocument.id}
					onclick={() => setDocument(reviewDocument.id)}
				>
					<span>{reviewDocument.label}</span>
					<small>{reviewDocument.description}</small>
				</button>
			{/each}
		</div>
		<div class="document-stats">
			{#if activeDocumentId === 'todo' && checklistProgress.total}
				<span
					><CheckCircle size={15} />
					{checklistProgress.complete}/{checklistProgress.total} done</span
				>
			{/if}
			<span
				><MessageSquare size={15} />
				{unresolvedCount} open note{unresolvedCount === 1 ? '' : 's'}</span
			>
		</div>
	</section>

	<div class="review-layout">
		<aside class="outline-panel" aria-label="Document outline">
			<div class="panel-label">On this page</div>
			<nav>
				{#each outline as heading (heading.id)}
					<button
						type="button"
						class:subheading={heading.level === 3}
						onclick={() => scrollToBlock(heading.id)}
					>
						{heading.text}
					</button>
				{/each}
			</nav>
		</aside>

		<main class="document-panel">
			<div class="document-tools">
				<label class="search-box">
					<Search size={17} />
					<input bind:value={searchQuery} placeholder="Find anything in this document" />
					{#if searchQuery}
						<button type="button" aria-label="Clear search" onclick={() => (searchQuery = '')}>
							<X size={15} />
						</button>
					{/if}
				</label>
				<span>{visibleBlocks.length} reviewable blocks</span>
			</div>

			{#if normalizedSearch && !visibleBlocks.length}
				<div class="empty-state">
					<Search size={24} />
					<strong>Nothing found</strong>
					<span>Try a shorter phrase.</span>
				</div>
			{:else}
				<div class="markdown-document">
					{#each visibleBlocks as block (block.id)}
						{@const blockComments = commentsForBlock(block.id)}
						<div
							id={`review-${block.id}`}
							class="review-block"
							class:selected={selectedBlockId === block.id}
							class:has-comments={blockComments.length > 0}
							class:owner-note={block.kind === 'note'}
							role="button"
							tabindex="0"
							onclick={(event) => {
								if ((event.target as HTMLElement).closest('a')) return;
								void selectBlock(block.id);
							}}
							onkeydown={(event) => handleBlockKeydown(event, block.id)}
						>
							<div class="block-gutter" aria-hidden="true">
								<MessageSquare size={14} />
								{#if blockComments.length}<b>{blockComments.length}</b>{/if}
							</div>
							<div class="block-content">
								{#if block.kind === 'heading'}
									{#if block.level === 1}
										<h1>{@html renderReviewInlineMarkdown(block.text || '')}</h1>
									{:else if block.level === 2}
										<h2>{@html renderReviewInlineMarkdown(block.text || '')}</h2>
									{:else if block.level === 3}
										<h3>{@html renderReviewInlineMarkdown(block.text || '')}</h3>
									{:else}
										<h4>{@html renderReviewInlineMarkdown(block.text || '')}</h4>
									{/if}
								{:else if block.kind === 'paragraph'}
									<p>{@html renderReviewInlineMarkdown(block.text || '')}</p>
								{:else if block.kind === 'note'}
									<div class="owner-note-card">
										<strong>Owner note</strong>
										<p>{@html renderReviewInlineMarkdown(block.text || '')}</p>
									</div>
								{:else if block.kind === 'quote'}
									<blockquote>{@html renderReviewInlineMarkdown(block.text || '')}</blockquote>
								{:else if block.kind === 'code'}
									<div class="code-block">
										{#if block.language}<span>{block.language}</span>{/if}
										<pre><code>{block.text}</code></pre>
									</div>
								{:else if block.kind === 'table'}
									<div class="table-wrap">
										<table>
											<thead>
												<tr>
													{#each block.headers || [] as header}
														<th>{@html renderReviewInlineMarkdown(header)}</th>
													{/each}
												</tr>
											</thead>
											<tbody>
												{#each block.rows || [] as row}
													<tr>
														{#each row as cell}
															<td>{@html renderReviewInlineMarkdown(cell)}</td>
														{/each}
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else if block.kind === 'list'}
									{#if block.ordered}
										<ol>
											{#each block.items || [] as item}
												<li>{@html renderReviewInlineMarkdown(item.text)}</li>
											{/each}
										</ol>
									{:else}
										<ul>
											{#each block.items || [] as item}
												<li class:checklist-item={item.checked !== undefined}>
													{#if item.checked !== undefined}
														<span class:complete={item.checked} class="check-box">
															{#if item.checked}<Check size={13} />{/if}
														</span>
													{/if}
													<span class:complete-text={item.checked}
														>{@html renderReviewInlineMarkdown(item.text)}</span
													>
												</li>
											{/each}
										</ul>
									{/if}
								{:else if block.kind === 'rule'}
									<hr />
								{/if}
							</div>
							<span class="line-number">L{block.lineStart}</span>
						</div>
					{/each}
				</div>
			{/if}
		</main>

		<aside class:open={mobileCommentsOpen} class="comment-panel" aria-label="Review comments">
			<div class="comment-header">
				<div>
					<span>Comments</span>
					<strong>{unresolvedCount} open</strong>
				</div>
				<button
					type="button"
					class="mobile-close"
					aria-label="Close comments"
					onclick={() => (mobileCommentsOpen = false)}
				>
					<X size={18} />
				</button>
			</div>

			{#if selectedBlock}
				<div class="selected-context">
					<span>Commenting on line {selectedBlock.lineStart}</span>
					<p>{selectedBlock.plainText.slice(0, 190)}</p>
				</div>
				<label class="comment-composer">
					<span>Your thought</span>
					<textarea
						bind:this={commentInput}
						bind:value={draft}
						rows="4"
						placeholder="What should change, stay, or be clarified?"
						onkeydown={(event) => {
							if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') addComment();
						}}
					></textarea>
					<small>⌘/Ctrl + Enter to save</small>
				</label>
				<button class="save-comment" type="button" onclick={addComment} disabled={!draft.trim()}>
					<MessageSquare size={16} /> Add comment
				</button>

				{#if selectedComments.length}
					<div class="selected-comment-list">
						{#each selectedComments as comment (comment.id)}
							<article class:resolved={comment.resolved} class="comment-card">
								<p>{comment.text}</p>
								<div>
									<span>{formatCommentDate(comment.createdAt)}</span>
									<button type="button" onclick={() => toggleResolved(comment.id)}>
										{comment.resolved ? 'Reopen' : 'Resolve'}
									</button>
									<button
										type="button"
										class="delete-button"
										aria-label="Delete comment"
										onclick={() => deleteComment(comment.id)}
									>
										<Trash2 size={14} />
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="comment-empty">
					<div><MessageSquare size={22} /></div>
					<strong>Click anywhere in the document</strong>
					<p>The exact paragraph, table, heading or task will be attached to your comment.</p>
				</div>
			{/if}

			<div class="all-comments-heading">
				<span>{showResolved ? 'All document notes' : 'Open document notes'}</span>
				<button type="button" onclick={() => (showResolved = !showResolved)}>
					{showResolved ? 'Hide resolved' : 'Show resolved'}
				</button>
			</div>
			<div class="all-comments">
				{#each activeComments as comment (comment.id)}
					<button
						type="button"
						class:resolved={comment.resolved}
						onclick={() => openComment(comment)}
					>
						<span>Line {comment.lineStart}</span>
						<strong>{comment.text}</strong>
					</button>
				{:else}
					<p class="no-comments">No {showResolved ? '' : 'open '}comments yet.</p>
				{/each}
			</div>
		</aside>
	</div>

	{#if unresolvedCount > 0 && !mobileCommentsOpen}
		<button
			class="mobile-comment-trigger"
			type="button"
			onclick={() => (mobileCommentsOpen = true)}
		>
			<MessageSquare size={17} />
			{unresolvedCount} note{unresolvedCount === 1 ? '' : 's'}
		</button>
	{/if}
</div>

<style>
	:global(body) {
		background:
			radial-gradient(circle at 58% -12%, rgba(37, 181, 112, 0.12), transparent 36rem), #07090c;
	}

	.review-page {
		--review-green: #31d886;
		--review-ink: #ecf7f1;
		--review-muted: #93a49b;
		min-height: calc(100vh - 74px);
		color: var(--review-ink);
	}

	.review-hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		padding: 1.8rem 0 1.45rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.hero-copy {
		max-width: 710px;
	}

	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.65rem;
		color: var(--review-green);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.review-hero h1 {
		margin: 0;
		font-size: clamp(1.75rem, 3.6vw, 3.25rem);
		line-height: 1.03;
		letter-spacing: -0.055em;
	}

	.review-hero p {
		max-width: 650px;
		margin: 0.8rem 0 0;
		color: var(--review-muted);
		font-size: 0.96rem;
		line-height: 1.6;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.55rem;
	}

	.local-badge,
	.action-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 38px;
		padding: 0.5rem 0.78rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.035);
		color: #d8e5de;
		font-size: 0.76rem;
		font-weight: 700;
	}

	.local-badge span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--review-green);
		box-shadow: 0 0 12px rgba(49, 216, 134, 0.85);
	}

	.action-button {
		cursor: pointer;
		transition: 160ms ease;
	}

	.action-button:hover:not(:disabled) {
		border-color: rgba(49, 216, 134, 0.4);
		background: rgba(49, 216, 134, 0.08);
		transform: translateY(-1px);
	}

	.action-button.primary {
		border-color: rgba(49, 216, 134, 0.5);
		background: var(--review-green);
		color: #04130b;
	}

	.action-button:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.copy-toast {
		position: fixed;
		top: 4.2rem;
		right: 1rem;
		z-index: 80;
		padding: 0.65rem 0.85rem;
		border: 1px solid rgba(49, 216, 134, 0.35);
		border-radius: 12px;
		background: #10241a;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
		color: #dff9ea;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.review-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 0;
	}

	.document-tabs {
		display: flex;
		gap: 0.55rem;
	}

	.document-tabs button {
		min-width: 205px;
		padding: 0.72rem 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 13px;
		background: rgba(255, 255, 255, 0.025);
		color: var(--review-muted);
		text-align: left;
		cursor: pointer;
		transition: 160ms ease;
	}

	.document-tabs button.active {
		border-color: rgba(49, 216, 134, 0.38);
		background: rgba(49, 216, 134, 0.085);
		box-shadow: inset 0 0 0 1px rgba(49, 216, 134, 0.06);
		color: var(--review-ink);
	}

	.document-tabs span,
	.document-tabs small {
		display: block;
	}

	.document-tabs span {
		font-size: 0.87rem;
		font-weight: 800;
	}

	.document-tabs small {
		margin-top: 0.16rem;
		font-size: 0.67rem;
		line-height: 1.35;
		opacity: 0.72;
	}

	.document-stats {
		display: flex;
		gap: 0.55rem;
		color: var(--review-muted);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.document-stats span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.6rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.035);
	}

	.review-layout {
		display: grid;
		grid-template-columns: 175px minmax(0, 1fr) 310px;
		align-items: start;
		gap: 1rem;
		padding-bottom: 5rem;
	}

	.outline-panel,
	.comment-panel {
		position: sticky;
		top: 4.5rem;
		max-height: calc(100vh - 5.5rem);
		overflow-y: auto;
	}

	.outline-panel {
		padding: 0.85rem 0.3rem 0.85rem 0;
	}

	.panel-label {
		margin: 0 0 0.55rem 0.55rem;
		color: #66776e;
		font-size: 0.67rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.outline-panel nav {
		display: grid;
		gap: 0.08rem;
	}

	.outline-panel button {
		padding: 0.38rem 0.55rem;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #899991;
		font-size: 0.71rem;
		line-height: 1.3;
		text-align: left;
		cursor: pointer;
	}

	.outline-panel button:hover {
		background: rgba(255, 255, 255, 0.04);
		color: #d7e4dd;
	}

	.outline-panel button.subheading {
		padding-left: 1rem;
		color: #697971;
	}

	.document-panel {
		min-width: 0;
		border: 1px solid rgba(255, 255, 255, 0.085);
		border-radius: 20px;
		background: rgba(11, 15, 18, 0.84);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.22);
		overflow: hidden;
	}

	.document-tools {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(255, 255, 255, 0.018);
	}

	.document-tools > span {
		flex: none;
		color: #6f8077;
		font-size: 0.67rem;
	}

	.search-box {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.48rem;
		min-width: 0;
		padding: 0 0.7rem;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 11px;
		background: rgba(0, 0, 0, 0.16);
		color: #6f8177;
	}

	.search-box input {
		width: 100%;
		min-width: 0;
		padding: 0.62rem 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--review-ink);
		font-size: 0.78rem;
	}

	.search-box button {
		display: grid;
		place-items: center;
		padding: 0.2rem;
		border: 0;
		background: transparent;
		color: #809087;
		cursor: pointer;
	}

	.markdown-document {
		padding: 1.1rem clamp(1rem, 3vw, 2.4rem) 3rem;
	}

	.review-block {
		position: relative;
		margin: 0 -0.65rem;
		padding: 0.42rem 2.1rem 0.42rem 0.65rem;
		border: 1px solid transparent;
		border-radius: 12px;
		outline: none;
		cursor: text;
		transition: 130ms ease;
	}

	.review-block:hover,
	.review-block:focus-visible {
		border-color: rgba(49, 216, 134, 0.14);
		background: rgba(49, 216, 134, 0.035);
	}

	.review-block.selected {
		border-color: rgba(49, 216, 134, 0.36);
		background: rgba(49, 216, 134, 0.065);
		box-shadow: 0 0 0 3px rgba(49, 216, 134, 0.025);
	}

	.review-block.has-comments:not(.selected) {
		border-left-color: rgba(170, 173, 255, 0.55);
	}

	.block-gutter {
		position: absolute;
		top: 0.62rem;
		right: 0.48rem;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		color: rgba(147, 164, 155, 0.3);
		pointer-events: none;
	}

	.review-block:hover .block-gutter,
	.review-block.selected .block-gutter,
	.review-block.has-comments .block-gutter {
		color: var(--review-green);
	}

	.block-gutter b {
		min-width: 15px;
		padding: 0 0.22rem;
		border-radius: 99px;
		background: rgba(49, 216, 134, 0.13);
		font-size: 0.59rem;
		line-height: 15px;
		text-align: center;
	}

	.line-number {
		position: absolute;
		right: 0.5rem;
		bottom: 0.14rem;
		color: transparent;
		font-size: 0.52rem;
		transition: 130ms ease;
	}

	.review-block:hover .line-number,
	.review-block.selected .line-number {
		color: #53635a;
	}

	.block-content :global(h1),
	.block-content :global(h2),
	.block-content :global(h3),
	.block-content :global(h4) {
		color: #f1f8f4;
	}

	.block-content :global(h1) {
		margin: 0.5rem 0 0.7rem;
		font-size: clamp(1.8rem, 4vw, 2.8rem);
		line-height: 1.08;
		letter-spacing: -0.05em;
	}

	.block-content :global(h2) {
		margin: 1.65rem 0 0.45rem;
		padding-top: 0.45rem;
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		font-size: 1.35rem;
		letter-spacing: -0.035em;
	}

	.block-content :global(h3) {
		margin: 1.1rem 0 0.3rem;
		color: #cfe0d7;
		font-size: 1rem;
	}

	.block-content :global(h4) {
		margin: 0.85rem 0 0.2rem;
		font-size: 0.87rem;
	}

	.block-content :global(p),
	.block-content :global(li),
	.block-content :global(td) {
		color: #aebdb5;
		font-size: 0.82rem;
		line-height: 1.72;
	}

	.block-content :global(p) {
		margin: 0.16rem 0;
	}

	.block-content :global(strong) {
		color: #e7f3ec;
		font-weight: 750;
	}

	.block-content :global(em) {
		color: #c6d6cd;
	}

	.block-content :global(a) {
		color: #aaadff;
		text-decoration: underline;
		text-decoration-color: rgba(170, 173, 255, 0.35);
		text-underline-offset: 3px;
	}

	.block-content :global(code) {
		padding: 0.12rem 0.3rem;
		border: 1px solid rgba(170, 173, 255, 0.16);
		border-radius: 5px;
		background: rgba(170, 173, 255, 0.08);
		color: #c9cbff;
		font-size: 0.78em;
	}

	.block-content :global(ul),
	.block-content :global(ol) {
		display: grid;
		gap: 0.24rem;
		margin: 0.2rem 0 0.4rem;
		padding-left: 1.25rem;
	}

	.block-content :global(li::marker) {
		color: var(--review-green);
	}

	.block-content :global(li.checklist-item) {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		list-style: none;
	}

	.check-box {
		display: grid;
		flex: none;
		place-items: center;
		width: 18px;
		height: 18px;
		margin-top: 0.25rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 6px;
		color: #062213;
	}

	.check-box.complete {
		border-color: var(--review-green);
		background: var(--review-green);
	}

	.complete-text {
		color: #718078;
		text-decoration: line-through;
		text-decoration-color: rgba(113, 128, 120, 0.45);
	}

	.table-wrap {
		margin: 0.35rem 0;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 12px;
		overflow-x: auto;
	}

	.table-wrap table {
		width: 100%;
		min-width: 570px;
		border-collapse: collapse;
	}

	.table-wrap th,
	.table-wrap td {
		padding: 0.62rem 0.68rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		text-align: left;
		vertical-align: top;
	}

	.table-wrap th {
		background: rgba(255, 255, 255, 0.035);
		color: #dce8e1;
		font-size: 0.69rem;
		font-weight: 800;
		letter-spacing: 0.03em;
	}

	.table-wrap tr:last-child td {
		border-bottom: 0;
	}

	.code-block {
		position: relative;
		margin: 0.3rem 0;
		border: 1px solid rgba(170, 173, 255, 0.16);
		border-radius: 12px;
		background: #070a0e;
		overflow: hidden;
	}

	.code-block > span {
		position: absolute;
		top: 0.45rem;
		right: 0.55rem;
		color: #67756e;
		font-size: 0.6rem;
		text-transform: uppercase;
	}

	.code-block pre {
		margin: 0;
		padding: 1rem;
		overflow-x: auto;
		color: #b9c8c0;
		font-size: 0.72rem;
		line-height: 1.55;
	}

	.code-block code {
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
	}

	.block-content blockquote,
	.owner-note-card {
		margin: 0.25rem 0;
		padding: 0.7rem 0.85rem;
		border-left: 3px solid #aaadff;
		border-radius: 5px 10px 10px 5px;
		background: rgba(170, 173, 255, 0.07);
		color: #c9d5ce;
	}

	.owner-note-card {
		border: 1px solid rgba(238, 255, 78, 0.2);
		border-left: 3px solid #eeff4e;
		background: rgba(238, 255, 78, 0.055);
	}

	.owner-note-card > strong {
		display: block;
		margin-bottom: 0.12rem;
		color: #eeff4e;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.block-content hr {
		margin: 1rem 0;
		border: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
	}

	.empty-state {
		display: grid;
		place-items: center;
		gap: 0.35rem;
		min-height: 300px;
		color: #6d7c74;
	}

	.empty-state strong {
		color: #b9c6bf;
	}

	.empty-state span {
		font-size: 0.76rem;
	}

	.comment-panel {
		padding: 0.8rem;
		border: 1px solid rgba(255, 255, 255, 0.085);
		border-radius: 16px;
		background: rgba(13, 18, 21, 0.94);
		box-shadow: 0 22px 65px rgba(0, 0, 0, 0.25);
	}

	.comment-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.08rem 0.05rem 0.7rem;
	}

	.comment-header > div {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.comment-header span {
		font-size: 0.88rem;
		font-weight: 850;
	}

	.comment-header strong {
		color: var(--review-green);
		font-size: 0.64rem;
	}

	.mobile-close {
		display: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.04);
		color: #b9c7c0;
	}

	.selected-context {
		padding: 0.66rem 0.7rem;
		border: 1px solid rgba(49, 216, 134, 0.16);
		border-radius: 10px;
		background: rgba(49, 216, 134, 0.045);
	}

	.selected-context span {
		color: var(--review-green);
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.selected-context p {
		display: -webkit-box;
		margin: 0.3rem 0 0;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		color: #98a89f;
		font-size: 0.7rem;
		line-height: 1.45;
	}

	.comment-composer {
		display: block;
		margin-top: 0.7rem;
	}

	.comment-composer > span {
		display: block;
		margin-bottom: 0.28rem;
		color: #b8c5be;
		font-size: 0.67rem;
		font-weight: 750;
	}

	.comment-composer textarea {
		width: 100%;
		resize: vertical;
		padding: 0.65rem;
		border: 1px solid rgba(255, 255, 255, 0.11);
		border-radius: 10px;
		outline: 0;
		background: #080c0e;
		color: #edf6f1;
		font: inherit;
		font-size: 0.76rem;
		line-height: 1.5;
	}

	.comment-composer textarea:focus {
		border-color: rgba(49, 216, 134, 0.48);
		box-shadow: 0 0 0 3px rgba(49, 216, 134, 0.07);
	}

	.comment-composer small {
		display: block;
		margin-top: 0.2rem;
		color: #596860;
		font-size: 0.58rem;
		text-align: right;
	}

	.save-comment {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		width: 100%;
		margin-top: 0.45rem;
		padding: 0.62rem;
		border: 0;
		border-radius: 10px;
		background: var(--review-green);
		color: #03150b;
		font-size: 0.74rem;
		font-weight: 850;
		cursor: pointer;
	}

	.save-comment:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.selected-comment-list,
	.all-comments {
		display: grid;
		gap: 0.42rem;
		margin-top: 0.7rem;
	}

	.comment-card {
		padding: 0.62rem;
		border: 1px solid rgba(170, 173, 255, 0.16);
		border-radius: 10px;
		background: rgba(170, 173, 255, 0.05);
	}

	.comment-card.resolved {
		opacity: 0.55;
	}

	.comment-card p {
		margin: 0;
		color: #c4d0c9;
		font-size: 0.71rem;
		line-height: 1.48;
	}

	.comment-card > div {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.46rem;
	}

	.comment-card span {
		margin-right: auto;
		color: #637169;
		font-size: 0.58rem;
	}

	.comment-card button {
		padding: 0;
		border: 0;
		background: transparent;
		color: #9eaaff;
		font-size: 0.61rem;
		font-weight: 750;
		cursor: pointer;
	}

	.comment-card button.delete-button {
		display: grid;
		place-items: center;
		color: #a06b6b;
	}

	.comment-empty {
		padding: 1.1rem 0.55rem;
		text-align: center;
	}

	.comment-empty > div {
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		margin: 0 auto 0.65rem;
		border: 1px solid rgba(49, 216, 134, 0.18);
		border-radius: 15px;
		background: rgba(49, 216, 134, 0.06);
		color: var(--review-green);
	}

	.comment-empty strong {
		display: block;
		font-size: 0.76rem;
	}

	.comment-empty p {
		margin: 0.35rem auto 0;
		color: #708078;
		font-size: 0.67rem;
		line-height: 1.45;
	}

	.all-comments-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 0.9rem;
		padding-top: 0.7rem;
		border-top: 1px solid rgba(255, 255, 255, 0.07);
	}

	.all-comments-heading span {
		color: #76867d;
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.all-comments-heading button {
		padding: 0;
		border: 0;
		background: transparent;
		color: #9da8ff;
		font-size: 0.59rem;
		cursor: pointer;
	}

	.all-comments button {
		display: grid;
		gap: 0.12rem;
		width: 100%;
		padding: 0.55rem 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.025);
		text-align: left;
		cursor: pointer;
	}

	.all-comments button:hover {
		border-color: rgba(170, 173, 255, 0.25);
	}

	.all-comments button.resolved {
		opacity: 0.5;
	}

	.all-comments span {
		color: #697870;
		font-size: 0.56rem;
	}

	.all-comments strong {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: #aebbb4;
		font-size: 0.67rem;
		line-height: 1.35;
	}

	.no-comments {
		margin: 0;
		padding: 0.5rem;
		color: #617068;
		font-size: 0.67rem;
		text-align: center;
	}

	.mobile-comment-trigger {
		display: none;
	}

	@media (max-width: 1120px) {
		.review-layout {
			grid-template-columns: minmax(0, 1fr) 290px;
		}

		.outline-panel {
			display: none;
		}
	}

	@media (max-width: 780px) {
		.review-hero {
			align-items: flex-start;
			padding-top: 1.1rem;
		}

		.review-hero,
		.review-toolbar {
			flex-direction: column;
		}

		.hero-actions,
		.document-tabs {
			width: 100%;
			justify-content: flex-start;
		}

		.document-tabs button {
			min-width: 0;
			width: 50%;
		}

		.document-stats {
			align-self: stretch;
		}

		.review-layout {
			display: block;
		}

		.document-panel {
			border-radius: 15px;
		}

		.document-tools > span {
			display: none;
		}

		.markdown-document {
			padding: 0.75rem 0.7rem 3.5rem;
		}

		.review-block {
			margin-inline: -0.25rem;
			padding-left: 0.5rem;
		}

		.block-content :global(h1) {
			font-size: 1.75rem;
		}

		.table-wrap {
			margin-right: -1.55rem;
		}

		.comment-panel {
			position: fixed;
			inset: auto 0 0;
			z-index: 70;
			display: none;
			max-height: min(76vh, 650px);
			padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom));
			border-radius: 20px 20px 0 0;
			background: rgba(11, 16, 18, 0.99);
			box-shadow: 0 -24px 80px rgba(0, 0, 0, 0.65);
		}

		.comment-panel.open {
			display: block;
		}

		.mobile-close {
			display: grid;
		}

		.mobile-comment-trigger {
			position: fixed;
			right: 1rem;
			bottom: calc(1rem + env(safe-area-inset-bottom));
			z-index: 60;
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			padding: 0.7rem 0.9rem;
			border: 0;
			border-radius: 999px;
			background: var(--review-green);
			box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
			color: #04150c;
			font-size: 0.75rem;
			font-weight: 850;
		}
	}

	@media (max-width: 520px) {
		.review-hero h1 {
			font-size: 2rem;
		}

		.local-badge {
			width: 100%;
			justify-content: flex-start;
		}

		.action-button {
			flex: 1;
		}

		.document-tabs {
			gap: 0.4rem;
		}

		.document-tabs button {
			padding: 0.65rem;
		}

		.document-tabs small {
			display: none;
		}
	}
</style>
