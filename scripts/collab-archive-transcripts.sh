#!/usr/bin/env bash
# collab-archive-transcripts.sh — Move ensemble agent transcripts out of the user's
# Claude Code session history.
#
# New runs pin a --session-id, so ensemble archives their transcripts automatically
# on disband. This script handles the backlog: sessions from before that existed,
# identified by the orchestration text ensemble injects.
#
# Archived, never deleted — the work inside those sessions is real.
#
# Usage:
#   collab-archive-transcripts.sh              # dry run: list what would move
#   collab-archive-transcripts.sh --force      # actually move them
#   collab-archive-transcripts.sh --projects-dir <dir> [--archive-dir <dir>]
set -euo pipefail

PROJECTS_DIR="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"
ARCHIVE_DIR="${ENSEMBLE_DATA_DIR:-$HOME/.ensemble}/transcripts/legacy"
MODE="dry-run"

G='\033[92m'; Y='\033[93m'; D='\033[2m'; W='\033[97m'; BD='\033[1m'; R='\033[0m'

while [ $# -gt 0 ]; do
  case "$1" in
    --force) MODE="force"; shift ;;
    --projects-dir) PROJECTS_DIR="${2:?dir required}"; shift 2 ;;
    --archive-dir) ARCHIVE_DIR="${2:?dir required}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# A transcript is ensemble's when its FIRST user message is injected orchestration
# text. Matching the first message (not any message) is what keeps real
# conversations that merely discuss ensemble out of the results.
is_agent_transcript() {
  python3 - "$1" <<'PY'
import json, sys

path = sys.argv[1]
try:
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if entry.get('type') != 'user':
                continue
            content = entry.get('message', {}).get('content')
            if isinstance(content, list):
                content = ' '.join(
                    part.get('text', '') for part in content if isinstance(part, dict)
                )
            if not content:
                continue
            first = str(content).strip()
            markers = (
                'in team "collab-',
                'in team "run-',
                '[ensemble watchdog]',
                'Are you still working? Share your progress with team-say.',
                '[Team message from',
                '⚡ USER INTERJECTION',
            )
            sys.exit(0 if any(marker in first for marker in markers) else 1)
except OSError:
    sys.exit(1)
sys.exit(1)
PY
}

echo ""
echo -e "  ${BD}${W}◈ ensemble transcript archive${R}"
echo -e "  ${D}scanning ${PROJECTS_DIR}${R}"
echo ""

FOUND=0
MOVED=0

while IFS= read -r transcript; do
  [ -f "$transcript" ] || continue
  if is_agent_transcript "$transcript"; then
    FOUND=$((FOUND + 1))
    SIZE=$(wc -c < "$transcript" | tr -d ' ')
    PROJECT="$(basename "$(dirname "$transcript")")"
    if [ "$MODE" = "force" ]; then
      mkdir -p "$ARCHIVE_DIR/$PROJECT"
      mv "$transcript" "$ARCHIVE_DIR/$PROJECT/"
      MOVED=$((MOVED + 1))
      echo -e "  ${G}→${R} $(basename "$transcript") ${D}(${SIZE}b, $PROJECT)${R}"
    else
      echo -e "  ${Y}•${R} $(basename "$transcript") ${D}(${SIZE}b, $PROJECT)${R}"
    fi
  fi
done < <(find "$PROJECTS_DIR" -type f -name '*.jsonl' 2>/dev/null)

echo ""
if [ "$FOUND" -eq 0 ]; then
  echo -e "  ${G}✓${R} No agent transcripts left in the session history."
elif [ "$MODE" = "force" ]; then
  echo -e "  ${G}✓${R} Archived ${MOVED} transcript(s) → ${ARCHIVE_DIR}"
else
  echo -e "  ${Y}!${R} ${FOUND} transcript(s) would move to ${ARCHIVE_DIR}"
  echo -e "  ${D}Re-run with --force to archive them.${R}"
fi
echo ""
