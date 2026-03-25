# G-Demand

Initial implementation baseline for the Sales Forecast Management application.

## What is implemented now

- Monorepo with `frontend` (React + Vite + TypeScript) and `backend` (Express + TypeScript).
- Prisma schema covering core domain entities from the implementation plan.
- Bootstrap script to create first admin user.
- Auth login endpoint and protected setup/admin endpoints.
- Apple-like UI shell and `MessageContext` modal flow (no browser alerts).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Configure backend environment:

```bash
cp backend/.env.example backend/.env
```

3. Set up database and generate Prisma client:

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

4. Create first admin:

```bash
npm run bootstrap:admin
```

5. Run backend and frontend (two terminals):

```bash
# Terminal 1
npm run dev -w backend

# Terminal 2
npm run dev -w frontend
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

## Current API endpoints

- `GET /health`
- `POST /auth/login`
- `GET /admin/summary` (auth required)
- `GET /setup/org-tree` (auth required)
- `POST /setup/groups` (auth required)
- `POST /setup/bus` (auth required)
- `POST /setup/companies` (auth required)
- `POST /setup/plants` (auth required)
- `POST /setup/sales` (auth required)
- `GET /setup/permissions` (auth required)
- `GET /setup/roles` (auth required)
- `POST /setup/roles` (auth required)
- `GET /setup/users` (auth required)
- `POST /setup/users` (auth required)
- `POST /setup/users/assign-role` (auth required)
