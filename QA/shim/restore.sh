#!/bin/bash
# Restore the real @neondatabase/serverless after the QA audit.
NEON="/Users/ali/edura/node_modules/.bun/@neondatabase+serverless@1.1.0/node_modules/@neondatabase/serverless"
for f in index.mjs index.js; do
  if [ -f "$NEON/$f.qa-backup" ]; then mv "$NEON/$f.qa-backup" "$NEON/$f"; echo "restored $f"; fi
done
grep -l "QA AUDIT SHIM" "$NEON"/index.* 2>/dev/null && echo "WARNING: shim still present" || echo "clean"
