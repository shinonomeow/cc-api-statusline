#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEBUG_ENV_FILE="${DEBUG_ENV_FILE:-$ROOT_DIR/.agent/debug.env}"
FIXTURE_FILE="${FIXTURE_FILE:-$ROOT_DIR/docs/fixtures/ccstatusline-context.sample.json}"
PROVIDER="${1:-sub2api}"

if [[ ! -f "$DEBUG_ENV_FILE" ]]; then
  echo "Missing debug env file: $DEBUG_ENV_FILE" >&2
  echo "Create it with SUB2API_* and RELAY_* values first." >&2
  exit 1
fi

if [[ ! -f "$FIXTURE_FILE" ]]; then
  echo "Missing fixture file: $FIXTURE_FILE" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but not found on PATH." >&2
  exit 1
fi

set -a
source "$DEBUG_ENV_FILE"
set +a

case "$PROVIDER" in
  sub2api)
    BASE_URL="${SUB2API_BASE_URL:-}"
    AUTH_TOKEN="${SUB2API_AUTH_TOKEN:-}"
    PROVIDER_ID="sub2api"
    ;;
  relay|claude-relay-service)
    BASE_URL="${RELAY_BASE_URL:-}"
    AUTH_TOKEN="${RELAY_AUTH_TOKEN:-}"
    PROVIDER_ID="claude-relay-service"
    ;;
  *)
    echo "Unknown provider: $PROVIDER" >&2
    echo "Usage: scripts/piped-example.sh [sub2api|relay]" >&2
    exit 1
    ;;
esac

if [[ -z "$BASE_URL" || -z "$AUTH_TOKEN" ]]; then
  echo "Missing credentials for provider '$PROVIDER' in $DEBUG_ENV_FILE" >&2
  exit 1
fi

cat "$FIXTURE_FILE" | \
  ANTHROPIC_BASE_URL="$BASE_URL" \
  ANTHROPIC_AUTH_TOKEN="$AUTH_TOKEN" \
  CC_STATUSLINE_PROVIDER="$PROVIDER_ID" \
  bun run src/main.ts --once
