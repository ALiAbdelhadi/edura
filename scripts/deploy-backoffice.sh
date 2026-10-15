#!/usr/bin/env bash
# Deploys the back-office Vercel project (superadmin + admin-api services).
#
# Vercel reads the services config from the vercel.json at the project root,
# and both projects use the repo root (a service root may not escape it). The
# root vercel.json is the ERP project's, so this stages a copy of the repo with
# vercel.backoffice.json in its place. `vercel deploy -A` does not help: the
# build reads vercel.json from the uploaded tree. The same goes for the
# container: Vercel accepts only the name Dockerfile.vercel.
#
# Usage: bash scripts/deploy-backoffice.sh [extra vercel deploy flags, e.g. --prod]
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

rsync -a --exclude-from="$repo/.vercelignore" --exclude=.vercel "$repo/" "$stage/"
cp "$repo/vercel.backoffice.json" "$stage/vercel.json"
cp "$repo/admin-api.Dockerfile" "$stage/Dockerfile.vercel"

cd "$stage"
vercel deploy --project edura-superadmin --yes --archive=tgz "$@"
