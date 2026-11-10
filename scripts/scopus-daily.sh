#!/bin/zsh
# Daily Scopus refresh on the iMac (run by a LaunchAgent, see install-scopus-daily.sh).
# Elsevier accepts the key only from the University of Phayao network, so this job runs
# here instead of GitHub Actions. It overwrites data/scopus.tsv, commits only when the
# content changed, and pushes; the push makes GitHub rebuild and redeploy the site.
# The key is read from the macOS Keychain (service "seen-scopus-api-key"), never a file.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$HOME/Library/Application Support/seen-scopus/repo"
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" }

KEY=$(security find-generic-password -s seen-scopus-api-key -w 2>/dev/null) || {
  log "ERROR: Scopus key not found in Keychain (service seen-scopus-api-key)"; exit 1; }
cd "$REPO" || { log "ERROR: $REPO missing; run install-scopus-daily.sh"; exit 1; }
# One job at a time in this clone (shared with scholar-poll.sh); a lock older than 2 h is stale.
LOCK="$HOME/Library/Application Support/seen-scopus/job.lock"
if [[ -d "$LOCK" && -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]]; then rmdir "$LOCK"; fi
for i in {1..30}; do mkdir "$LOCK" 2>/dev/null && break; sleep 60; done
[[ -d "$LOCK" ]] || { log "ERROR: job lock busy for 30 min"; exit 1; }
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
# A run killed mid-way (sleep, shutdown) leaves unstaged data or a half-done rebase;
# everything here is regenerated, so start from a clean checkout of origin/main (a hard
# reset also drops a local commit left behind by a failed push, which a rebase would not).
git rebase --abort >/dev/null 2>&1 || true
git fetch -q origin main || { log "ERROR: git fetch failed"; exit 1; }
git reset -q --hard origin/main || { log "ERROR: git reset failed"; exit 1; }
# The clone needs its packages for build-data and the conference screening (tsx); install once
# and again whenever package-lock.json changes.
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --silent --no-audit --no-fund || { log "ERROR: npm ci failed"; exit 1; }
fi

# Off the university network Elsevier refuses the key; the script then keeps the
# previous rows, so nothing changes and nothing is pushed.
SCOPUS_API_KEY="$KEY" node scripts/fetch-sources.mjs --only=scopus || { log "ERROR: Scopus fetch failed"; exit 1; }

# Conference screening for new proceedings: Claude Code (signed in on this Mac with
# `claude login`) looks up who organises each conference; see scripts/screen-conferences.ts.
# A failure here (not signed in, no network) must not block the Scopus push.
if command -v claude >/dev/null 2>&1; then
  if node scripts/build-data.mjs >/dev/null 2>&1; then
    node_modules/.bin/tsx scripts/screen-conferences.ts --limit 10 2>&1 | while IFS= read -r l; do log "$l"; done
    log "conference screening exit status ${pipestatus[1]}"
  else
    log "WARNING: build-data failed; conference screening skipped this run"
  fi
else
  log "claude not installed; conference screening skipped"
fi

# Nothing is pushed unless the site data still builds from it: a push redeploys the site, and
# a broken data file would fail that build for everyone. If the build fails, drop this run's
# conference screening first (the Scopus rows alone may be fine) and try once more.
if ! node scripts/build-data.mjs >/dev/null 2>&1; then
  log "WARNING: build-data fails with this run's data; dropping the conference screening changes"
  git checkout -q -- data/conferences.csv
  if ! node scripts/build-data.mjs >/dev/null 2>&1; then
    log "ERROR: build-data still fails with the new Scopus data; nothing pushed"
    node scripts/build-data.mjs 2>&1 | tail -5 | while IFS= read -r l; do log "$l"; done
    git reset -q --hard origin/main
    exit 1
  fi
fi

git add data/scopus.tsv data/scopus_journals.csv data/scopus_quartiles.csv data/conferences.csv
# data/status/scopus.txt is written only when Scopus answered (fetch-sources.mjs); it changes every
# successful day, so the site and the stale-data e-mail alert know this job is alive.
[[ -f data/status/scopus.txt ]] && git add data/status/scopus.txt
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
