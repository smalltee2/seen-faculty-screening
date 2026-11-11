// Phones show each row of a data table as a card, every cell as "header: value" (Tum asked for a
// mobile-friendly sfs_webapp.html, 2026-11-11). The CSS reads the header from a data-label attribute,
// which this module sets from each table's <thead>, so no page has to be edited. React does not own
// data-label, so a re-render keeps it; new rows are labelled by the observer in WebApp.tsx.

export interface CellSpan {
  colSpan: number
  rowSpan: number
}

/** The column each body cell starts in, allowing for cells above that span several rows
 *  (the outlook table's lecturer cell) or several columns. */
export function cellColumns(rows: CellSpan[][]): number[][] {
  const carry: number[] = [] // rows still covered, per column
  return rows.map((cells) => {
    let col = 0
    const out: number[] = []
    for (const c of cells) {
      while ((carry[col] ?? 0) > 0) col++
      out.push(col)
      for (let k = 0; k < Math.max(1, c.colSpan); k++) carry[col + k] = Math.max(1, c.rowSpan)
      col += Math.max(1, c.colSpan)
    }
    for (let k = 0; k < carry.length; k++) if (carry[k] > 0) carry[k]--
    return out
  })
}

/** Header text per column from the last header row (the one nearest the body). */
function headerLabels(table: HTMLTableElement): string[] {
  const rows = table.tHead?.rows
  if (!rows || rows.length === 0) return []
  const labels: string[] = []
  let col = 0
  for (const th of Array.from(rows[rows.length - 1].cells)) {
    const text = (th.textContent ?? '').replace(/\s+/g, ' ').trim()
    for (let k = 0; k < Math.max(1, th.colSpan); k++) labels[col + k] = text
    col += Math.max(1, th.colSpan)
  }
  return labels
}

export const MIN_CARD_COLUMNS = 5

/** Label every body cell of the wider data tables under `root`. The duty grid (table.matrix, not
 *  .data) and number grids (.compact) keep scrolling sideways as tables. */
export function labelTables(root: ParentNode) {
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('table.data'))) {
    const labels = headerLabels(table)
    // Narrow tables (up to 4 columns) already fit a phone and read better as a table.
    // .compact tables are number grids (the overview's type × year counts): they stay tables.
    if (labels.length < MIN_CARD_COLUMNS || table.classList.contains('compact')) {
      table.classList.remove('cards-on-phone')
      continue
    }
    for (const body of Array.from(table.tBodies)) {
      const rows = Array.from(body.rows)
      const cols = cellColumns(rows.map((r) => Array.from(r.cells).map((c) => ({ colSpan: c.colSpan, rowSpan: c.rowSpan }))))
      rows.forEach((r, i) =>
        Array.from(r.cells).forEach((cell, j) => {
          const label = labels[cols[i][j]] ?? ''
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label)
        }),
      )
    }
    table.classList.add('cards-on-phone')
  }
}
