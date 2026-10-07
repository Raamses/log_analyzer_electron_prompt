#!/usr/bin/env bash
# Log Analyzer — Pi-side SANITY gate. Fast, no Tauri shell, no Windows.
#
#   scripts/verify.sh            install + tsc -b + vitest run
#   scripts/verify.sh --quick    skip install
#
# exit 0 = no regression vs the recorded baseline.
#
# THIS IS NOT THE DONE GATE. The authoritative build/test/e2e runs on Windows via
# claude-win using scripts/verify.ps1 — the app is a Tauri desktop shell and this
# script cannot exercise IPC, the native file dialog, or the packaged binary.
# Green here means "no type or unit regression", nothing more.

set -uo pipefail
# NOTE: repo-root scripts/ -> ../log-analyzer-dashboard. Without the `../` this cd
# fails silently (no `set -e`) and every gate runs in the repo root, where there is
# no vitest config — producing mass phantom failures. Verify the cd took effect.
cd "$(dirname "$0")/../log-analyzer-dashboard" || { echo "FATAL: cannot enter dashboard dir" >&2; exit 2; }
[ -f package.json ] || { echo "FATAL: no package.json in $(pwd)" >&2; exit 2; }

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

# Known failures that do not fail the run, each OWNED by an open bug note (rubric R13), matched by
# file + exact test name as in verify.ps1. A count was not enough: fixing the baseline test and breaking
# another one printed SANITY GREEN (PR #23 review F1.2). Format "file|test name". Keep this list identical
# to verify.ps1 and the spec's "Known baseline"; delete an entry when its fix lands.
BASELINE_TESTS=(
  "src/components/__tests__/LogAnalyzer.test.tsx|typing a query into the query bar actually filters the rendered rows"  # vault/bugs/2026-10-07-query-bar-filter-regression.md
)

FAILED=(); RESULTS=()
ok()  { printf '\033[32m[PASS]\033[0m %s\n' "$1"; RESULTS+=("PASS  $1"); }
bad() { printf '\033[31m[FAIL]\033[0m %s\n' "$1"; FAILED+=("$1"); RESULTS+=("FAIL  $1"); }

echo "Log Analyzer (Pi sanity) — $(date -u +%Y-%m-%dT%H:%M:%SZ) — $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

if [ "$QUICK" -eq 0 ]; then
  printf '\n\033[1m=== install ===\033[0m\n'
  if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi
  [ $? -eq 0 ] && ok "install" || bad "install"
else
  printf '\033[33m[SKIP]\033[0m install (--quick)\n'
fi

printf '\n\033[1m=== tsc -b ===\033[0m\n'
npx tsc -b && ok "types (tsc -b)" || bad "types (tsc -b)"

printf '\n\033[1m=== vitest run ===\033[0m\n'
UNIT_OUT=$(npx vitest run 2>&1); UNIT_RC=$?
UNIT_PLAIN=$(printf '%s' "$UNIT_OUT" | sed -r 's/\x1B\[[0-9;]*[mGKHF]//g')
printf '%s' "$UNIT_PLAIN" | tail -5
UNIT_FAILED=$(printf '%s' "$UNIT_PLAIN" | grep -oE 'Tests +[0-9]+ failed' | grep -oE '[0-9]+' | tail -1)
HAS_SUMMARY=$(printf '%s' "$UNIT_PLAIN" | grep -cE 'Test Files +[0-9]+ (failed|passed)')
if [ -z "$UNIT_FAILED" ] && [ "$HAS_SUMMARY" -eq 0 ]; then
  bad "unit (no vitest summary — run crashed/killed, exit $UNIT_RC)"
  printf '%s' "$UNIT_PLAIN" | tail -25
else
  UNIT_FAILED=${UNIT_FAILED:-0}
  # Failing tests by name: vitest's summary lists each as " FAIL  <file> > <suite> > <test>".
  mapfile -t FAIL_LINES < <(printf '%s\n' "$UNIT_PLAIN" | grep -E '^ *FAIL +' \
    | sed -E 's/^ *FAIL +//; s/ +[0-9.]+ ?m?s$//' | sort -u)
  UNEXPECTED=()
  for line in "${FAIL_LINES[@]}"; do
    known=0
    for b in "${BASELINE_TESTS[@]}"; do
      case "$line" in *"${b%%|*}"*"${b#*|}") known=1 ;; esac
    done
    [ "$known" -eq 1 ] || UNEXPECTED+=("$line")
  done
  if [ "$UNIT_FAILED" -gt 0 ] && [ "${#FAIL_LINES[@]}" -eq 0 ]; then
    bad "unit ($UNIT_FAILED failing, but no FAIL line could be read: counted as new failures)"
  elif [ "${#UNEXPECTED[@]}" -eq 0 ]; then
    ok "unit ($UNIT_FAILED failing, all in the owned baseline)"
  else
    bad "unit (${#UNEXPECTED[@]} failing outside the owned baseline)"
    printf '  %s\n' "${UNEXPECTED[@]}" | head -20
  fi
fi

printf '\n\033[1m=== SUMMARY ===\033[0m\n'
printf '  %s\n' "${RESULTS[@]}"
if [ "${#FAILED[@]}" -eq 0 ]; then
  printf '\n\033[32mSANITY GREEN\033[0m — no type/unit regression. Evidence: %s @ %s\n' \
    "$(git rev-parse --short HEAD)" "$(date -u +%Y-%m-%d)"
  printf '\033[33mNOTE:\033[0m this is NOT a done signal. Run scripts/verify.ps1 on Windows via claude-win.\n'
  exit 0
fi
printf '\n\033[31mSANITY RED\033[0m — failed: %s\n' "${FAILED[*]}"
exit 1