// Google Scholar profile → TSV rows for data/publications.tsv
//
// How to use:
//   1. Open the lecturer's Scholar profile with &pagesize=100 at the end of the URL,
//      e.g. https://scholar.google.com/citations?user=XXXXXXX&hl=en&pagesize=100
//   2. Open the browser console (Chrome: Cmd+Option+J), paste this whole file, press Enter.
//   3. Type the lecturer's name_en exactly as in data/faculty.csv when asked.
//   4. The script clicks "Show more" until all rows are loaded, then copies the rows
//      (without a header) to the clipboard. Paste them at the end of data/publications.tsv.
//
// Columns: key, year, title, authors, venue, cites (tab-separated).
// Runs only in your own browser on a page you opened; nothing is sent anywhere.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const profileName = document.querySelector('#gsc_prf_in')?.textContent.trim() ?? ''
  const key = prompt('name_en ของอาจารย์ (ต้องตรงกับ data/faculty.csv):', profileName)
  if (!key) {
    console.warn('Cancelled: no name_en given.')
    return
  }

  // Load every row: click "Show more" until it is disabled.
  for (let i = 0; i < 50; i++) {
    const more = document.querySelector('#gsc_bpf_more')
    if (!more || more.disabled) break
    const before = document.querySelectorAll('tr.gsc_a_tr').length
    more.click()
    for (let t = 0; t < 40 && document.querySelectorAll('tr.gsc_a_tr').length === before; t++) await sleep(250)
  }

  const clean = (s) => (s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  const rows = [...document.querySelectorAll('tr.gsc_a_tr')].map((tr) => {
    const title = clean(tr.querySelector('.gsc_a_at')?.textContent)
    const grays = tr.querySelectorAll('.gsc_a_t .gs_gray')
    const authors = clean(grays[0]?.textContent)
    // The venue cell repeats the year in a hidden span (", 2021"); keep it, as the site expects Scholar's format.
    const venue = clean(grays[1]?.textContent)
    const year = clean(tr.querySelector('.gsc_a_y span')?.textContent)
    const cites = clean(tr.querySelector('.gsc_a_c a')?.textContent).replace(/\D/g, '') || '0'
    return [key, year, title, authors, venue, cites].join('\t')
  })

  if (!rows.length) {
    console.error('No publication rows found. Is this a Google Scholar profile page?')
    return
  }
  const text = rows.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    console.log(`Copied ${rows.length} rows for "${key}" to the clipboard.`)
  } catch {
    // Clipboard access can be refused when the console has focus; Chrome's copy() works there.
    if (typeof copy === 'function') {
      copy(text)
      console.log(`Copied ${rows.length} rows for "${key}" with copy().`)
    } else {
      console.log(text)
      console.log(`Could not copy; ${rows.length} rows printed above.`)
    }
  }
})()
