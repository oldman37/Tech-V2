# Tech Department Management System v2

Modern full-stack web application for managing technology department operations including inventory, equipment tracking, purchase orders, maintenance requests, and user management.

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite
- Material-UI (MUI)
- TanStack Query (React Query)
- React Router v6
- Zustand (state management)
- Microsoft Entra ID authentication

### Backend
- Node.js with TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- Microsoft Entra ID integration
- JWT authentication

## Project Structure

```
tech-v2/
├── backend/          # Node.js/Express API
├── frontend/         # React application
├── shared/           # Shared types and utilities
├── docs/             # Documentation
├── scripts/          # Utility scripts
└── MODERNIZATION_PLAN.md
```

## Getting Started

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 15+
- Microsoft Entra ID tenant
- Git

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd Tech-V2
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Install frontend dependencies
```bash
cd frontend
npm install
```

4. Set up environment variables (see .env.example files in each directory)

5. Run database migrations
```bash
cd backend
npx prisma migrate dev
```

6. Start development servers

Backend:
```bash
cd backend
npm run dev
```

Frontend:
```bash
cd frontend
npm run dev
```

## Development

- Backend runs on: http://localhost:3000
- Frontend runs on: http://localhost:5173

## Documentation

See [MODERNIZATION_PLAN.md](./MODERNIZATION_PLAN.md) for the complete modernization strategy and implementation guide.

## License

Internal use only - [Your Company Name]
