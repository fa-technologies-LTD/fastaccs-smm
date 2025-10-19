export type PageData = Awaited<ReturnType<typeof import('./+page.server').load>>;
