type Lecturer = { name_en: string; name_th?: string }
type TciAuthor = { name?: string | null; name_loc?: string | null }
type TciArticle = Record<string, string | null | undefined>
export function tciAuthorMatch(authors: TciAuthor[] | undefined, f: Lecturer): boolean
export function tciTitle(article: TciArticle, known?: Set<string>): string
export function tciRow(f: Lecturer, article: TciArticle, authors: TciAuthor[], issn?: string, known?: Set<string>): Record<string, string | number> | null
