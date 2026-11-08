#!/bin/zsh
# Installs the iMac job for the "อัปเดตจาก Google Scholar" button: every 5 minutes it asks the
# backend whether a job waits (scripts/scholar-poll.sh). Needs the Scopus job's clone
# (install-scopus-daily.sh) and the token in the Keychain (service seen-scholar-token).
# Remove:  launchctl bootout gui/$UID ~/Library/LaunchAgents/th.ac.up.seen.scholar-poll.plist
set -e
LABEL=th.ac.up.seen.scholar-poll
REPO="$HOME/Library/Application Support/seen-scopus/repo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/seen-scholar.log"
[[ -d "$REPO/.git" ]] || { echo "Run scripts/install-scopus-daily.sh first"; exit 1; }
security find-generic-password -s seen-scholar-token >/dev/null 2>&1 || { echo "Scholar token missing in Keychain (service seen-scholar-token)"; exit 1; }
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$REPO/scripts/scholar-poll.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$UID" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "Installed $LABEL (every 5 min). Log: $LOG"
