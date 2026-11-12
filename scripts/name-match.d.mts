export function nameKey(name: unknown): string
export function lecturerNames(f: { name_en?: string; name_th?: string }): string[]
export function namedOn(work: { authorships?: { raw_author_name?: string | null; author?: { display_name?: string | null } | null }[] }, names: string[]): boolean
