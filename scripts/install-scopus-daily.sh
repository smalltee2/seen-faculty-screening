#!/bin/zsh
# Installs the daily Scopus job on this Mac (07:30 every day; if the Mac is asleep then,
# it runs when it wakes). Run once:  zsh scripts/install-scopus-daily.sh
# Remove:  launchctl bootout gui/$UID ~/Library/LaunchAgents/th.ac.up.seen.scopus-daily.plist
set -e
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LABEL=th.ac.up.seen.scopus-daily
DIR="$HOME/Library/Application Support/seen-scopus"
REPO="$DIR/repo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/seen-scopus.log"

if ! security find-generic-password -s seen-scopus-api-key >/dev/null 2>&1; then
  echo "First save the Scopus key in the Keychain (it asks for the key, hidden):"
  echo "  security add-generic-password -a \"\$USER\" -s seen-scopus-api-key -w"
  exit 1
fi

mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
[[ -d "$REPO/.git" ]] || gh repo clone smalltee2/seen-faculty-screening "$REPO"
git -C "$REPO" config user.name "Teerachai Amnuaylojaroen"
git -C "$REPO" config user.email "teerachai.am@up.ac.th"
gh auth setup-git
(cd "$REPO" && npm ci --silent --no-audit --no-fund)

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$REPO/scripts/scopus-daily.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$UID" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "Installed $LABEL (daily 07:30). Log: $LOG"
echo "Running it once now..."
launchctl kickstart "gui/$UID/$LABEL"
