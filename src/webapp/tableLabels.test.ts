import { describe, expect, it } from 'vitest'
import { cellColumns } from './tableLabels'

const c = (colSpan = 1, rowSpan = 1) => ({ colSpan, rowSpan })

describe('cellColumns', () => {
  it('plain rows: cells sit in columns 0, 1, 2 …', () => {
    expect(cellColumns([[c(), c(), c()], [c(), c(), c()]])).toEqual([[0, 1, 2], [0, 1, 2]])
  })
  it('a cell spanning rows pushes the next rows one column right (the outlook table)', () => {
    // row 1: lecturer (spans 3 rows), role, year · rows 2–3: role, year only
    expect(cellColumns([[c(1, 3), c(), c()], [c(), c()], [c(), c()], [c(), c(), c()]])).toEqual([[0, 1, 2], [1, 2], [1, 2], [0, 1, 2]])
  })
  it('a cell spanning columns moves the following cells along', () => {
    expect(cellColumns([[c(2), c()], [c(), c(), c()]])).toEqual([[0, 2], [0, 1, 2]])
  })
})
