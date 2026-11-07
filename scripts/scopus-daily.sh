#!/bin/zsh
# Daily Scopus refresh on the iMac (run by a LaunchAgent, see install-scopus-daily.sh).
# Elsevier accepts the key only from the University of Phayao network, so this job runs
# here instead of GitHub Actions. It overwrites data/scopus.tsv, commits only when the
# content changed, and pushes; the push makes GitHub rebuild and redeploy the site.
# The key is read from the macOS Keychain (service "seen-scopus-api-key"), never a file.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$HOME/Library/Application Support/seen-scopus/repo"
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" }

KEY=$(security find-generic-password -s seen-scopus-api-key -w 2>/dev/null) || {
  log "ERROR: Scopus key not found in Keychain (service seen-scopus-api-key)"; exit 1; }
cd "$REPO" || { log "ERROR: $REPO missing; run install-scopus-daily.sh"; exit 1; }
# A run killed mid-way (sleep, shutdown) leaves unstaged data or a half-done rebase;
# everything here is regenerated, so start from a clean checkout of origin/main (a hard
# reset also drops a local commit left behind by a failed push, which a rebase would not).
git rebase --abort >/dev/null 2>&1 || true
git fetch -q origin main || { log "ERROR: git fetch failed"; exit 1; }
git reset -q --hard origin/main || { log "ERROR: git reset failed"; exit 1; }

# Off the university network Elsevier refuses the key; the script then keeps the
# previous rows, so nothing changes and nothing is pushed.
SCOPUS_API_KEY="$KEY" node scripts/fetch-sources.mjs --only=scopus || { log "ERROR: Scopus fetch failed"; exit 1; }

# Conference screening for new proceedings: Claude Code (signed in on this Mac with
# `claude login`) looks up who organises each conference; see scripts/screen-conferences.ts.
# A failure here (not signed in, no network) must not block the Scopus push.
if command -v claude >/dev/null 2>&1; then
  if node scripts/build-data.mjs >/dev/null 2>&1; then
    npx tsx scripts/screen-conferences.ts --limit 10 2>&1 | while IFS= read -r l; do log "$l"; done
  else
    log "WARNING: build-data failed; conference screening skipped this run"
  fi
else
  log "claude not installed; conference screening skipped"
fi

git add data/scopus.tsv data/scopus_journals.csv data/conferences.csv
if git diff --cached --quiet; then
  log "No Scopus or conference changes"
  exit 0
fi
git commit -q -m "Scopus refresh and conference screening from iMac $(date +%Y-%m-%d)"
if ! git push -q; then
  log "Push rejected, rebasing and retrying"
  git pull --rebase -q && git push -q || { git rebase --abort >/dev/null 2>&1; log "ERROR: push failed"; exit 1; }
fi
log "Pushed Scopus update"
