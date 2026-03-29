#!/bin/bash
cd "$(dirname "$0")"

[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
export PATH="/Library/PostgreSQL/17/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"
export PGPASSWORD=qwer1234

echo "=== Killing existing node/tsx/vite processes ==="
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

LOG="$HOME/G-demand-setup.log"
echo "=== Restart started $(date) ===" | tee "$LOG"

echo "=== Installing dependencies ===" | tee -a "$LOG"
npm install 2>&1 | tail -3 | tee -a "$LOG"

cd backend

echo "=== Generating Prisma client ===" | tee -a "$LOG"
npx prisma generate 2>&1 | tail -5 | tee -a "$LOG"

echo "=== Creating database ===" | tee -a "$LOG"
createdb -U postgres g_demand 2>&1 | tee -a "$LOG" || echo "(db already exists)" | tee -a "$LOG"

echo "=== Running migrations ===" | tee -a "$LOG"
npx prisma migrate deploy 2>&1 | tee -a "$LOG"

echo "=== Bootstrapping admin ===" | tee -a "$LOG"
npx tsx src/scripts/bootstrapAdmin.ts 2>&1 | tee -a "$LOG" || echo "(admin may already exist)" | tee -a "$LOG"

cd ..

echo "=== Starting dev servers ===" | tee -a "$LOG"
npm run dev
