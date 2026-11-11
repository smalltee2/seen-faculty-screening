#!/bin/sh
# Test the Scopus key from this computer (e.g. on the University of Phayao network).
# Asks for the key without showing it, runs one author search, and prints the result.
# Nothing is saved.
# The terminal's echo comes back even when the script is interrupted at the prompt.
trap 'stty echo 2>/dev/null' EXIT
trap 'exit 130' INT TERM
printf 'Paste Scopus API key (hidden): '
stty -echo; IFS= read -r KEY; stty echo; echo
[ -n "$KEY" ] || { echo 'No key given.'; exit 1; }
# The key goes to curl on standard input (-K -), not on its command line, where other users of
# this computer could read it in the process list. printf is a shell builtin.
printf 'header = "X-ELS-APIKey: %s"\n' "$KEY" | curl -s -K - --max-time 60 -w '\nHTTP %{http_code}\n' -H 'Accept: application/json' \
  'https://api.elsevier.com/content/search/scopus?query=AUTHLASTNAME(Amnuaylojaroen)%20AND%20AFFIL(Phayao)&count=1' \
  | head -c 600
echo
