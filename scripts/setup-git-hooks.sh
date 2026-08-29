#!/usr/bin/env bash
# Points git at the repo's tracked hooks. Run once per clone.
set -euo pipefail

cd "$(dirname "$0")/.."

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
echo "core.hooksPath -> .githooks"

if command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks $(gitleaks version) is installed."
else
  echo ""
  echo "WARNING: gitleaks is NOT installed, and the pre-commit hook refuses to"
  echo "         commit unscanned changes. Install it before your next commit:"
  echo "           brew install gitleaks"
fi
