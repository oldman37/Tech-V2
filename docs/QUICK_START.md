# Quick Start Guide

## Project Setup Complete! ✅

You now have a complete foundation for the Tech Department Management System modernization.

## What's Been Set Up

### Backend (Node.js + Express + TypeScript)
- ✅ Express server with security middleware (Helmet, CORS, Rate Limiting)
- ✅ TypeScript configuration
- ✅ Prisma ORM with PostgreSQL schema
- ✅ Complete database models for all features
- ✅ Environment configuration template
- ✅ Health check endpoint

### Frontend (React + TypeScript + Vite)
- ✅ React 18 with TypeScript
- ✅ Vite build tool configured
- ✅ Basic welcome page
- ✅ Proxy configuration for API calls

### Project Structure
```
Tech-V2/
├── backend/
│   ├── src/
│   │   └── server.ts          # Express server
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── *.css
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── .env.example
├── shared/                    # For shared types (future)
├── docs/
├── scripts/
├── .gitignore
├── README.md
└── MODERNIZATION_PLAN.md
```

## Next Steps

### 1. Set Up PostgreSQL

You need PostgreSQL installed and running:

**Option A: Install locally**
- Download from: https://www.postgresql.org/download/windows/
- Default port: 5432
- Create database: `tech_v2`

**Option B: Use cloud service**
- Azure Database for PostgreSQL
- AWS RDS
- Neon.tech (free tier)

### 2. Configure Environment Variables

**Backend:**
```bash
cd backend
copy .env.example .env
# Edit .env with your actual values
```

Required settings:
- `DATABASE_URL` - Your PostgreSQL connection string
- `ENTRA_TENANT_ID` - From Azure Portal
- `ENTRA_CLIENT_ID` - From Azure Portal
- `ENTRA_CLIENT_SECRET` - From Azure Portal

**Frontend:**
```bash
cd frontend
copy .env.example .env
# Edit .env with your Entra ID settings
```

### 3. Run Database Migrations

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

This will:
- Generate Prisma Client
- Create all database tables
- Set up relationships and indexes

### 4. Start the Backend Server

```bash
cd backend
npm run dev
```

The server will start on: http://localhost:3000

Test it: http://localhost:3000/health

### 5. Start the Frontend

Open a new terminal:

```bash
cd frontend
npm run dev
```

The frontend will start on: http://localhost:5173

## Testing the Setup

1. **Backend Health Check:**
   - Open: http://localhost:3000/health
   - Should return JSON with status "ok"

2. **Backend API Info:**
   - Open: http://localhost:3000/api
   - Should show available endpoints

3. **Frontend:**
   - Open: http://localhost:5173
   - Should see the welcome page with feature list

## What's Next?

### Phase 1: Database Analysis (Current)
- [ ] Document existing MySQL database schema
- [ ] Export sample data from C:\wwwroot
- [ ] Map PHP file functionality to new API endpoints

### Phase 2: Entra ID Setup
- [ ] Create App Registration in Azure Portal
- [ ] Configure redirect URIs
- [ ] Set up API permissions
- [ ] Create security groups for roles

### Phase 3: Backend Development
- [ ] Authentication routes (Entra ID integration)
- [ ] User management endpoints
- [ ] Equipment/inventory endpoints
- [ ] Purchase order endpoints
- [ ] Maintenance order endpoints

### Phase 4: Frontend Development
- [ ] Install UI framework (Material-UI or Tailwind)
- [ ] Authentication flow
- [ ] Dashboard layout
- [ ] Feature modules

## Available Commands

### Backend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Run production server
npm run prisma:generate    # Generate Prisma Client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open Prisma Studio (DB GUI)
```

### Frontend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## Troubleshooting

### "Cannot find module" errors
```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
```

### Port already in use
- Backend: Change `PORT` in backend/.env
- Frontend: Change `server.port` in frontend/vite.config.ts

### Database connection errors
- Check PostgreSQL is running
- Verify DATABASE_URL in backend/.env
- Test connection: `npx prisma db pull`

## Resources

- [Modernization Plan](../MODERNIZATION_PLAN.md) - Complete implementation guide
- [Prisma Docs](https://www.prisma.io/docs) - Database & ORM
- [Express Docs](https://expressjs.com/) - Backend framework
- [React Docs](https://react.dev/) - Frontend framework
- [Vite Docs](https://vitejs.dev/) - Build tool
- [Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/) - Authentication

## Need Help?

1. Check the [MODERNIZATION_PLAN.md](../MODERNIZATION_PLAN.md)
2. Review error logs in terminal
3. Check Prisma Studio for database issues: `npm run prisma:studio`
4. Verify environment variables are set correctly

---

**Ready to proceed?** Start with setting up PostgreSQL and configuring your environment variables!
