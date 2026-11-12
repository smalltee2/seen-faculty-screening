type Lecturer = { name_en: string; name_th?: string }
type TciAuthor = { name?: string | null; name_loc?: string | null }
type TciArticle = Record<string, string | null | undefined>
export function tciAuthorMatch(authors: TciAuthor[] | undefined, f: Lecturer): boolean
type Known = { title: string; year: number | string | null }[]
export function tciTitle(article: TciArticle, known?: Known, year?: number | null): string
export function tciRow(f: Lecturer, article: TciArticle, authors: TciAuthor[], issn?: string, known?: Known): Record<string, string | number> | null
