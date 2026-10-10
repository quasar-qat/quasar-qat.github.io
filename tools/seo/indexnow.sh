#!/usr/bin/env bash
# Ping IndexNow (Bing/Copilot, DuckDuckGo via Bing, Yandex, Seznam, Naver, Yep, Internet Archive, Amazon)
# for the live site. Run ONLY after launch, and again only when page content changed.
#
#   tools/seo/indexnow.sh            # POST / and /quasar.pdf (never the Markdown copies index.md/llms.txt)
#   tools/seo/indexnow.sh -n         # dry run: checks + payload, no POST, no live checks
#   tools/seo/indexnow.sh URL ...    # extra absolute URLs on https://quasar-qat.github.io/
#
# Key = the single <32 hex>.txt file at the repo root (its body is the key). Prints the HTTP code:
# 200 OK, 202 accepted (key validation pending), 400 bad request, 403 key file not found/invalid,
# 422 URLs don't match host/key, 429 too many requests.
set -euo pipefail

HOST="quasar-qat.github.io"
BASE="https://$HOST"
ENDPOINT="https://api.indexnow.org/indexnow"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DRY=0
if [[ "${1:-}" == "-n" ]]; then DRY=1; shift; fi

keyfiles="$(ls "$ROOT" | grep -E '^[0-9a-f]{32}\.txt$' || true)"
if [[ -z "$keyfiles" || "$(printf '%s\n' "$keyfiles" | wc -l | tr -d ' ')" != "1" ]]; then
  echo "error: expected exactly one <32-hex>.txt key file in $ROOT, found: ${keyfiles:-none}" >&2; exit 1
fi
KEY="${keyfiles%.txt}"
if [[ "$(tr -d '\r\n' < "$ROOT/$KEY.txt")" != "$KEY" ]]; then
  echo "error: $KEY.txt must contain exactly the key $KEY" >&2; exit 1
fi

URLS=("$BASE/" "$BASE/quasar.pdf")
for u in "$@"; do
  [[ "$u" == "$BASE/"* ]] || { echo "error: $u is not on $BASE/ (IndexNow would answer 422)" >&2; exit 1; }
  URLS+=("$u")
done

PAYLOAD="$(python3 - "$HOST" "$KEY" "${URLS[@]}" <<'PY'
import json, sys
host, key, *urls = sys.argv[1:]
print(json.dumps({"host": host, "key": key,
                  "keyLocation": f"https://{host}/{key}.txt", "urlList": urls}))
PY
)"

if (( DRY )); then
  echo "dry run, would POST to $ENDPOINT:"; echo "$PAYLOAD"; exit 0
fi

# Refuse to ping before launch: the key file and every URL must be live.
live="$(curl -fsSL "$BASE/$KEY.txt" 2>/dev/null | tr -d '\r\n' || true)"
if [[ "$live" != "$KEY" ]]; then
  echo "error: $BASE/$KEY.txt is not serving the key yet; deploy first" >&2; exit 1
fi
for u in "${URLS[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$u")"
  if [[ "$code" != "200" ]]; then echo "error: $u returns $code; deploy it first" >&2; exit 1; fi
done

code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json; charset=utf-8' --data "$PAYLOAD")"
echo "IndexNow HTTP $code (${#URLS[@]} URLs)"
case "$code" in
  200|202) exit 0 ;;
  *) exit 1 ;;
esac
