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

# One job at a time in this clone (shared with scopus-daily.sh); a lock older than 2 h is stale.
if [[ -d "$LOCK" && -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]]; then rmdir "$LOCK"; fi
mkdir "$LOCK" 2>/dev/null || { log "Scholar: another job is running; will retry"; exit 0; }
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

TOKEN=$(security find-generic-password -s seen-scholar-token -w 2>/dev/null) || { log "ERROR: Scholar token not in Keychain"; exit 1; }
git rebase --abort >/dev/null 2>&1 || true
git fetch -q origin main && git reset -q --hard origin/main || { log "ERROR: git update failed"; exit 1; }
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --silent --no-audit --no-fund || { log "ERROR: npm ci failed"; exit 1; }
fi

log "Scholar: job claimed, refreshing"
OUT=$(SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs run 2>&1 | tail -1)
STATUS=${OUT%%$'\t'*}
MSG=${OUT#*$'\t'}
[[ "$STATUS" == NONE ]] && { log "Scholar: job taken by another run"; exit 0; }
if [[ "$STATUS" != done && "$STATUS" != blocked ]]; then
  git checkout -q -- data/publications.tsv
  SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs finish failed "${MSG:-เกิดข้อผิดพลาด}"
  log "Scholar: failed: $OUT"; exit 1
fi
if ! node scripts/build-data.mjs >/dev/null 2>&1; then
  git checkout -q -- data/publications.tsv
  SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs finish failed "ข้อมูลที่ได้จาก Scholar ผ่านการตรวจไม่ได้ จึงไม่บันทึก"
  log "Scholar: build-data failed; changes discarded"; exit 1
fi
git add data/publications.tsv
if git diff --cached --quiet; then
  MSG="$MSG · ไม่มีการเปลี่ยนแปลง"
else
  git commit -q -m "Google Scholar refresh from iMac $(date +%Y-%m-%d)"
  if ! git push -q; then
    git pull --rebase -q && git push -q || { git rebase --abort >/dev/null 2>&1; SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs finish failed "บันทึกข้อมูลขึ้น GitHub ไม่สำเร็จ"; log "ERROR: push failed"; exit 1; }
  fi
  MSG="$MSG · เว็บจะอัปเดตภายในไม่กี่นาที"
fi
SCHOLAR_TOKEN="$TOKEN" node scripts/scholar-job.mjs finish "$STATUS" "$MSG"
log "Scholar: $STATUS: $MSG"
