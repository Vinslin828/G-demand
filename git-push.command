#!/bin/bash
cd "$(dirname "$0")"

LOG="$(dirname "$0")/git-push.log"
echo "=== Git push started $(date) ===" | tee "$LOG"

# Remove stale lock if it exists
rm -f .git/index.lock 2>/dev/null && echo "Removed stale index.lock" | tee -a "$LOG"

# Show current status
echo "=== Current git status ===" | tee -a "$LOG"
git status --short 2>&1 | tee -a "$LOG"

# Stage changes
echo "=== Staging changes ===" | tee -a "$LOG"
git add \
  .gitignore \
  IMPLEMENTATION_PLAN.md \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/ \
  backend/src/routes/auth.ts \
  backend/src/routes/setup.ts \
  backend/src/routes/forecast.ts \
  backend/src/routes/masterData.ts \
  backend/src/server.ts \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/src/App.tsx \
  frontend/src/index.css \
  frontend/src/main.tsx \
  frontend/src/i18n/ \
  package-lock.json \
  start-dev.command \
  restart.command \
  2>&1 | tee -a "$LOG"

# Commit
echo "=== Committing ===" | tee -a "$LOG"
git commit -m "feat: Phase 2 — master data, forecast version management, org restructure

- Add forecast version management with LTP (quarterly) and RFC (monthly) support
- Add closing date logic with working calendar and closing rule assignments
- Add master data routes: product/channel dimensions, forecast origins, period configs, zero handling
- Restructure org hierarchy: Group → BU (planning) and Company → Plant (operational) as separate hierarchies
- Add i18n support (English, Traditional Chinese, Simplified Chinese)
- Add migration scripts for all schema changes
- Add start-dev.command and restart.command for easy local startup
- Update frontend with full admin, master data, and forecast planning UI" 2>&1 | tee -a "$LOG"

# Push
echo "=== Pushing to GitHub ===" | tee -a "$LOG"
git push origin main 2>&1 | tee -a "$LOG"

echo "=== Done ===" | tee -a "$LOG"
