#!/usr/bin/env bash
# fork-status.sh — What has upstream done since we branched, and does it collide
# with what we changed?
#
# Run this BEFORE starting work on this fork. The point is to catch the case where
# upstream has already fixed the thing you were about to fix: on 2026-08-13 this
# fork rebuilt an auto-disband fix that upstream had landed three days earlier.
#
# Usage:
#   ./scripts/fork-status.sh              # compare current branch against upstream/main
#   ./scripts/fork-status.sh <branch>     # compare a specific branch
set -uo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
UPSTREAM_REMOTE="${FORK_UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${FORK_UPSTREAM_BRANCH:-main}"
UP="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

# ANSI-C quoted: these are embedded in git --format strings, which do not
# interpret backslash escapes the way echo -e does.
G=$'\033[92m'; Y=$'\033[93m'; C=$'\033[96m'; D=$'\033[2m'; W=$'\033[97m'; BD=$'\033[1m'; R=$'\033[0m'

if ! git remote get-url "$UPSTREAM_REMOTE" > /dev/null 2>&1; then
  echo "No '$UPSTREAM_REMOTE' remote. Add it with:" >&2
  echo "  git remote add $UPSTREAM_REMOTE https://github.com/michelhelsdingen/ensemble.git" >&2
  exit 1
fi

echo ""
printf "%b\n" "  ${BD}${W}◈ fork status${R}  ${D}${BRANCH} vs ${UP}${R}"
echo ""

printf "%b" "  ${D}fetching…${R}\r"
git fetch -q "$UPSTREAM_REMOTE" 2>/dev/null
printf "%b\n" "                    \r"

BASE=$(git merge-base "$BRANCH" "$UP" 2>/dev/null)
if [ -z "$BASE" ]; then
  echo "  Cannot find a merge base between $BRANCH and $UP." >&2
  exit 1
fi

AHEAD=$(git rev-list --count "$UP".."$BRANCH")
BEHIND=$(git rev-list --count "$BRANCH".."$UP")
printf "%b\n" "  ${W}${AHEAD}${R} commit(s) ours  ${D}·${R}  ${W}${BEHIND}${R} commit(s) upstream we lack"
printf "%b\n" "  ${D}common ancestor: $(git log -1 --format='%h %ad %s' --date=short "$BASE" | cut -c1-72)${R}"
echo ""

if [ "$BEHIND" -eq 0 ]; then
  printf "%b\n" "  ${G}✓${R} Up to date with upstream — nothing to dedupe."
  echo ""
  exit 0
fi

printf "%b\n" "  ${BD}Upstream commits we do not have${R}"
git log --format="    ${C}%h${R} ${D}%ad${R} %s" --date=short "$BASE".."$UP" | head -25
TOTAL=$(git rev-list --count "$BASE".."$UP")
[ "$TOTAL" -gt 25 ] && printf "%b\n" "    ${D}… and $((TOTAL - 25)) more${R}"
echo ""

# The dedupe signal: files we changed that upstream also changed since the split.
#
# Rename-aware on purpose. Comparing plain --name-only lists misses the case a live
# collab run caught in this very script: if upstream renames a file we also edited,
# the old path is absent from theirs and the new path absent from ours, so the
# collision passes silently. -M reports renames as "R<score>\told\tnew"; counting
# both paths keeps the file matchable from either side.
changed_paths() {
  git diff --name-status -M "$1".."$2" \
    | awk -F'\t' '{ if ($1 ~ /^R/) { print $2; print $3 } else if (NF >= 2) { print $2 } }' \
    | sort -u
}
OURS=$(changed_paths "$BASE" "$BRANCH")
THEIRS=$(changed_paths "$BASE" "$UP")
OVERLAP=$(comm -12 <(echo "$OURS") <(echo "$THEIRS"))

# Renames upstream applied to files we also touched: the path in our tree no longer
# exists there, so "no upstream commits touch this file" would be misleading.
RENAMES=$(git diff --name-status -M "$BASE".."$UP" | awk -F'\t' '$1 ~ /^R/ { print $2"\t"$3 }')
if [ -n "$RENAMES" ]; then
  while IFS=$'\t' read -r from to; do
    [ -z "$from" ] && continue
    if echo "$OURS" | grep -qx "$from"; then
      printf "%b\n" "  ${Y}!${R} upstream renamed a file we changed: ${from} → ${to}"
    fi
  done <<< "$RENAMES"
fi

if [ -z "$OVERLAP" ]; then
  printf "%b\n" "  ${G}✓${R} No file touched by both sides — a rebase should be clean."
else
  printf "%b\n" "  ${Y}!${R} ${BD}Touched by both — check these before claiming a fix is novel${R}"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    theirs_n=$(git log --oneline "$BASE".."$UP" -- "$f" | wc -l | tr -d ' ')
    printf "%b\n" "    ${Y}•${R} ${f} ${D}(${theirs_n} upstream commit(s))${R}"
    git log --format="        ${D}%h %s${R}" "$BASE".."$UP" -- "$f" | head -3
  done <<< "$OVERLAP"
fi
echo ""

# Anything we already sent upstream, so it is not proposed twice.
if command -v gh > /dev/null 2>&1; then
  UPSTREAM_SLUG=$(git remote get-url "$UPSTREAM_REMOTE" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')
  ME=$(gh api user --jq .login 2>/dev/null || echo "")
  if [ -n "$ME" ]; then
    printf "%b\n" "  ${BD}Our open contributions to ${UPSTREAM_SLUG}${R}"
    gh pr list --repo "$UPSTREAM_SLUG" --author "$ME" --state all --limit 10 \
      --json number,state,title \
      --template '{{range .}}    PR #{{.number}} [{{.state}}] {{.title}}{{"\n"}}{{end}}' 2>/dev/null \
      || printf "%b\n" "    ${D}(could not query)${R}"
    gh issue list --repo "$UPSTREAM_SLUG" --author "$ME" --state all --limit 10 \
      --json number,state,title \
      --template '{{range .}}    Issue #{{.number}} [{{.state}}] {{.title}}{{"\n"}}{{end}}' 2>/dev/null \
      || true
    echo ""
  fi
fi

printf "%b\n" "  ${D}To catch up:  git rebase ${UP}${R}"
echo ""
