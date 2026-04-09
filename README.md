# Farm2Cook

B2C fresh meat ordering platform with admin dashboard and WhatsApp bot.

## Structure

```
Farm2Cook/
├── backend/     # Fastify API (Node.js + PostgreSQL)
├── frontend/    # React Admin Dashboard (Vite + Tailwind)
├── docker-compose.dev.yml  # Dev database (PostgreSQL + Redis)
└── .env.example
```

## Quick Start

### 1. Setup Database (pick one)

**Option A: Docker (recommended)**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Option B: Use your own PostgreSQL**
- Create a database and update `DATABASE_URL` in `.env`

### 2. Backend

```bash
cd backend
cp .env.example .env     # Edit .env with your values
npm install
npm run db:migrate
npm run db:seed
npm run dev              # Starts on http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev              # Starts on http://localhost:5173
```

### 4. Login

- URL: http://localhost:5173
- Email: `admin@farm2cook.com`
- Password: `admin123!`

## Production Build

```bash
# Backend
cd backend && npm run build && npm start

# Frontend
cd frontend && npm run build && npm run preview
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS 4, Radix UI, TanStack Query, Zustand |
| Backend | Fastify 5, Drizzle ORM, PostgreSQL 16, BullMQ, Redis |
| Payments | Stripe |
| Messaging | WhatsApp (Twilio / Meta Cloud API) |
| Email | Gmail SMTP (Nodemailer) |
| Push | Web Push (VAPID) |
