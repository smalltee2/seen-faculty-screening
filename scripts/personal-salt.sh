#!/bin/zsh
# One-time setup of the secret salt behind the personal links (run by the admin on the Mac):
# generates a random salt, stores it in the macOS Keychain (item "seen-personal-salt", used by
# `npm run personal-links`) and as the GitHub Actions secret PERSONAL_SALT (used by the build).
# Re-running with --rotate creates a new salt: every personal link changes and must be re-sent.
set -eu
REPO="smalltee2/seen-faculty-screening"
if security find-generic-password -s seen-personal-salt -w >/dev/null 2>&1 && [[ "${1:-}" != "--rotate" ]]; then
  echo "Keychain already has seen-personal-salt; use --rotate to replace it (all links change)."
  SALT=$(security find-generic-password -s seen-personal-salt -w)
else
  SALT=$(openssl rand -hex 32)
  security delete-generic-password -s seen-personal-salt >/dev/null 2>&1 || true
  security add-generic-password -s seen-personal-salt -a "$USER" -w "$SALT"
  echo "Salt stored in Keychain (seen-personal-salt)."
fi
printf '%s' "$SALT" | gh secret set PERSONAL_SALT --repo "$REPO"
echo "GitHub secret PERSONAL_SALT set. The next deploy builds the personal pages; print the lecturers' codes with: npm run personal-codes"
