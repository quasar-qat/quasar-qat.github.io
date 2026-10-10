#!/bin/sh
# Parity test: assets/js/quasar-core.js (JavaScriptCore) vs quasar_np.py (numpy reference of Algorithm 1).
#   tools/run_quasar_parity.sh            exported groups (assets/data/groups.json), bits 2/3/4
#   tools/run_quasar_parity.sh --all DIR  also all 2,352 npz groups (writes ~70 MB of JSON to DIR)
# Environment:
#   QUASAR_NP_DIR      directory holding quasar_np.py (required)
#   QUASAR_GROUPS_NPZ  npz sample of the random groups (required for --all)
#   QUASAR_PY          python with numpy (default: python3)
#   QUASAR_PARITY_REF  where to write the numpy reference (default: tools/_private/quasar_parity_ref.json)
set -e
SITE="$(cd "$(dirname "$0")/.." && pwd)"
PY="${QUASAR_PY:-python3}"
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}"
CORE="$SITE/assets/js/quasar-core.js"
REF="${QUASAR_PARITY_REF:-$SITE/tools/_private/quasar_parity_ref.json}"

if [ -z "$QUASAR_NP_DIR" ]; then
  echo "run_quasar_parity.sh: set QUASAR_NP_DIR (directory holding quasar_np.py)" >&2
  exit 2
fi
[ -x "$JSC" ] || { echo "run_quasar_parity.sh: JavaScriptCore jsc not found at $JSC (set JSC)" >&2; exit 2; }

"$PY" "$SITE/tools/quasar_parity_ref.py" --out "$REF"
"$JSC" "$SITE/tools/quasar_parity_jsc.js" -- "$CORE" "$SITE/assets/data/groups.json" "$REF"

if [ "$1" = "--all" ]; then
  mkdir -p "$2"
  "$PY" "$SITE/tools/quasar_parity_ref.py" --all "$2"
  "$JSC" "$SITE/tools/quasar_parity_jsc.js" -- "$CORE" "$2/all_groups.json" "$2/all_ref.json"
fi
