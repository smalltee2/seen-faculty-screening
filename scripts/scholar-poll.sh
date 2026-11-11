#!/bin/zsh
# iMac job for the "อัปเดตจาก Google Scholar" button (Tum, 2026-11-08), run every 5 minutes by a
# LaunchAgent (see install-scholar-poll.sh). It asks the backend whether a job waits (one small
# request); only then it updates the clone, refreshes Scholar (scripts/fetch-scholar.mjs), checks
# the data, commits data/publications.tsv and pushes, which redeploys the site. The token is read
# from the macOS Keychain (service "seen-scholar-token"), never a file.
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
DIR="$HOME/Library/Application Support/seen-scopus"
REPO="$DIR/repo"
LOCK="$DIR/job.lock"
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" }

cd "$REPO" || { log "ERROR: $REPO missing; run install-scopus-daily.sh"; exit 1; }
# The check does not depend on the clone's scripts, so it works even before the clone is updated.
API=$(/usr/bin/plutil -extract loginApiUrl raw -o - data/sources.json 2>/dev/null) || exit 0
curl -sL --max-time 30 -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"scholarJob"}' "$API" | grep -q '"status":"requested"' || exit 0

# One job at a time in this clone (shared with scopus-daily.sh).
# The lock is a directory holding the owner's process id. It is stale when that process is gone (a
# run killed by sleep or shutdown), or, for a lock without an id, when it is older than 2 h.
lock_stale() {
  [[ -d "$LOCK" ]] || return 1
  local pid=""
  [[ -f "$LOCK/pid" ]] && pid=$(<"$LOCK/pid")
  if [[ "$pid" == <-> ]]; then
    # Alive and one of these two jobs: busy. A recycled process id belongs to something else.
    ps -p "$pid" -o command= 2>/dev/null | grep -qE 'scholar-poll\.sh|scopus-daily\.sh' && return 1
    return 0
  fi
  [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]]
}
unlock() { rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null }
lock_stale && unlock
mkdir "$LOCK" 2>/dev/null || { log "Scholar: another job is running; will retry"; exit 0; }
print -r -- $$ > "$LOCK/pid"
trap unlock EXIT

TOKEN=$(security find-generic-password -s seen-scholar-token -w 2>/dev/null) || { log "ERROR: Scholar token not in Keychain"; exit 1; }
git rebase --abort >/dev/null 2>&1 || true
git fetch -q origin main && git reset -q --hard origin/main || { log "ERROR: git update failed"; exit 1; }
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --silent --no-audit --no-fund || { log "ERROR: npm ci failed"; exit 1; }
fi

log "Scholar: job claimed, refreshing"
# Tell the backend how the job ended; a closing step that does not arrive is logged, because the
# admin page would keep showing the job as running.
finish() { SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs finish "$1" "$2" 2>&1 | while IFS= read -r l; do log "Scholar: $l"; done }
# This run's data and stamp are dropped together, so a failed run does not leave "checked just now".
discard() { git checkout -q -- data/publications.tsv data/status/scholar.txt }
RAW=$(SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs run 2>&1)
# The result is the line "STATUS<TAB>message"; anything else the run printed (a crash, a warning) is not it.
OUT=$(print -r -- "$RAW" | grep -E $'^(done|blocked|failed|NONE)\t' | tail -1)
STATUS=${OUT%%$'\t'*}
MSG=${OUT#*$'\t'}
[[ "$STATUS" == NONE ]] && { log "Scholar: job taken by another run"; exit 0; }
if [[ "$STATUS" != done && "$STATUS" != blocked ]]; then
  discard
  finish failed "${MSG:-เกิดข้อผิดพลาด}"
  log "Scholar: failed: ${OUT:-$(print -r -- "$RAW" | tail -1)}"; exit 1
fi
if ! node scripts/build-data.mjs >/dev/null 2>&1; then
  discard
  finish failed "ข้อมูลที่ได้จาก Scholar ผ่านการตรวจไม่ได้ จึงไม่บันทึก"
  log "Scholar: build-data failed; changes discarded"; exit 1
fi
git add data/publications.tsv
# The stamp alone (Scholar answered, nothing changed) is committed too, so the site shows the check.
[[ -f data/status/scholar.txt ]] && git add data/status/scholar.txt
if git diff --cached --quiet -- data/publications.tsv; then
  if ! git diff --cached --quiet; then
    git commit -q -m "Google Scholar checked from iMac $(date +%Y-%m-%d)"
    git push -q || { git pull --rebase -q && git push -q; } || { git rebase --abort >/dev/null 2>&1; git reset -q --hard origin/main; log "WARNING: stamp push failed"; }
  fi
  MSG="$MSG · ไม่มีการเปลี่ยนแปลง"
else
  git commit -q -m "Google Scholar refresh from iMac $(date +%Y-%m-%d)"
  if ! git push -q; then
    git pull --rebase -q && git push -q || { git rebase --abort >/dev/null 2>&1; git reset -q --hard origin/main; finish failed "บันทึกข้อมูลขึ้น GitHub ไม่สำเร็จ"; log "ERROR: push failed"; exit 1; }
  fi
  MSG="$MSG · เว็บจะอัปเดตภายในไม่กี่นาที"
fi
finish "$STATUS" "$MSG"
log "Scholar: $STATUS: $MSG"
