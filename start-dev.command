#!/bin/bash
cd "$(dirname "$0")"

[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
export PATH="/Library/PostgreSQL/17/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"
export PGPASSWORD=qwer1234

LOG="$HOME/G-demand-setup.log"
echo "=== Setup started $(date) ===" | tee "$LOG"
echo "=== Node: $(node -v), npm: $(npm -v) ===" | tee -a "$LOG"

echo "=== Installing dependencies ===" | tee -a "$LOG"
npm install 2>&1 | tail -5 | tee -a "$LOG"

cd backend

echo "=== Generating Prisma client ===" | tee -a "$LOG"
npx prisma generate 2>&1 | tee -a "$LOG"

echo "=== Creating database (if not exists) ===" | tee -a "$LOG"
createdb -U postgres g_demand 2>&1 | tee -a "$LOG" || echo "(db may already exist, continuing)" | tee -a "$LOG"

echo "=== Testing DB connection ===" | tee -a "$LOG"
psql -U postgres -d g_demand -c "SELECT 1;" 2>&1 | tee -a "$LOG"

echo "=== Running migrations ===" | tee -a "$LOG"
npx prisma migrate deploy 2>&1 | tee -a "$LOG"

echo "=== Bootstrapping admin ===" | tee -a "$LOG"
npx tsx src/scripts/bootstrapAdmin.ts 2>&1 | tee -a "$LOG" || echo "(admin may already exist)" | tee -a "$LOG"

cd ..

echo "=== Starting dev servers ===" | tee -a "$LOG"
npm run dev
