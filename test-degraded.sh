#!/bin/bash

echo "=== Slowfire Bot Phase 0 - Degraded Mode Test ==="
echo ""

# Save original .env
cp .env .env.backup

# Remove DATABASE_URL to test degraded mode
grep -v "^DATABASE_URL" .env > .env.tmp && mv .env.tmp .env

echo "Testing without DATABASE_URL..."
node test-basic.mjs

# Restore .env
mv .env.backup .env

echo ""
echo "=== Degraded mode test complete ==="