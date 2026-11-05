#!/bin/sh
# Test the Scopus key from this computer (e.g. on the University of Phayao network).
# Asks for the key without showing it, runs one author search, and prints the result.
# Nothing is saved.
printf 'Paste Scopus API key (hidden): '
stty -echo; read KEY; stty echo; echo
curl -s -w '\nHTTP %{http_code}\n' -H "X-ELS-APIKey: $KEY" -H 'Accept: application/json' \
  'https://api.elsevier.com/content/search/scopus?query=AUTHLASTNAME(Amnuaylojaroen)%20AND%20AFFIL(Phayao)&count=1' \
  | head -c 600
echo
