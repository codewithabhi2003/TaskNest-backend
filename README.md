# TaskNest — Backend API •

> **Secure. Validated. Production-ready.**  
> The REST API powering TaskNest — a full-stack project management platform built for teams who want clarity without complexity.

---

## Overview

TaskNest Backend is a Node.js 20 REST API built with Express and MongoDB. It handles authentication, workspace management, project and task operations, team collaboration, and transactional email — all protected by Arcjet's runtime security layer and validated end-to-end with Zod schemas before any controller logic runs.

---

## Features

### Authentication & Security
- Email/password registration with JWT session management (`httpOnly` cookies)
- Email verification on sign-up via SendGrid
- Forgot password / reset password flow with time-limited tokens
- **Arcjet** runtime security — rate limiting, bot protection, and shield middleware on all routes
- **Zod + zod-express-middleware** — every request body validated at the schema level before reaching a controller

### Task Management APIs
- Full CRUD for tasks with title, description, priority, due dates, and assignee support
- Filter tasks by status, priority, and archived state
- `GET /my-tasks` — fetch all tasks assigned to the authenticated user across workspaces

### Workspace & Project APIs
- Create and manage multiple workspaces with role-based membership (Owner / Admin / Member)
- Invite and manage team members per workspace
- Projects scoped to workspaces with full CRUD
- Workspace-level stats endpoint powering dashboard analytics (totals, overdue counts, velocity)

### Developer Experience
- **Morgan** HTTP request logging for structured observability
- MVC architecture — clean separation across controllers, models, routes, middleware, and libs
- CI/CD via GitHub Actions with Vercel auto-deployment
- Node.js 20 pinned in `engines` field for deployment consistency

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + Express |
| Database | MongoDB + Mongoose |
| Auth | JWT (httpOnly cookies) + bcrypt |
| Validation | Zod + zod-express-middleware |
| Security | Arcjet (rate limiting / bot protection / shield) |
| Email | SendGrid (`@sendgrid/mail`) |
| Logging | Morgan |
| Deployment | Vercel |
| CI/CD | GitHub Actions |

---

## Project Structure

```
TaskNest-backend/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD pipeline
├── controllers/            # Business logic — auth, task, project, workspace, user
├── libs/                   # Arcjet config, SendGrid setup, DB connection, schema validators
├── middleware/             # JWT auth guard, Arcjet security middleware, error handling
├── models/                 # Mongoose schemas — User, Workspace, Project, Task
├── routes/                 # Express route definitions per resource
├── index.js                # Server entry point — Express app setup + DB connect
└── package.json
```

---

## API Overview

### Auth — `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user + send verification email |
| POST | `/api/auth/login` | Login and receive JWT cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/verify-email/:token` | Verify email address |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password/:token` | Reset password with token |

### Users — `/api/users`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/profile` | Get logged-in user profile |
| PUT | `/api/users/profile` | Update display name and profile picture |
| PUT | `/api/users/change-password` | Change password with confirmation |

### Workspaces — `/api/workspaces`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/workspaces` | List all workspaces for logged-in user |
| POST | `/api/workspaces` | Create a new workspace |
| GET | `/api/workspaces/:id` | Get workspace details and members |
| PUT | `/api/workspaces/:id` | Update workspace settings |
| DELETE | `/api/workspaces/:id` | Delete workspace (Owner only) |
| GET | `/api/workspaces/:id/stats` | Dashboard statistics — totals, overdue, velocity |

### Projects — `/api/projects`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List all projects in a workspace |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/:id` | Get project details |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Tasks — `/api/tasks`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List tasks (filterable by status, priority, archived) |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/:id` | Get single task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/tasks/my-tasks` | All tasks assigned to the logged-in user |

---

## Security Architecture

Every request passes through a layered security pipeline before any business logic runs:

```
Incoming Request
      ↓
  Arcjet Shield        ← Rate limiting, bot detection, attack pattern blocking
      ↓
  Auth Middleware      ← JWT verification from httpOnly cookie
      ↓
  Zod Validation       ← Request body validated against schema
      ↓
  Controller           ← Safe, validated data reaches business logic
```

**Arcjet** handles runtime threats — brute-force on auth routes, automated scrapers, and common attack signatures — before they reach application code.

**Zod schemas** enforce strict input contracts. A missing field or wrong type returns a structured `400` error with field-level messages. Controllers only execute with clean, typed data.

---

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB (local or Atlas)
- SendGrid account with a verified sender email
- Arcjet account + API key

### 1. Clone the repository

```bash
git clone https://github.com/codewithabhi2003/TaskNest-backend.git
cd TaskNest-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/tasknest
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

# SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key
EMAIL_FROM=your_verified_sender@email.com

# Arcjet
ARCJET_KEY=your_arcjet_api_key
```

### 4. Start the development server

```bash
npm run dev
```

API will be available at `http://localhost:5000`

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | Token expiry duration (e.g. `7d`) |
| `CLIENT_URL` | Frontend URL for CORS and email links |
| `SENDGRID_API_KEY` | SendGrid API key for transactional email |
| `EMAIL_FROM` | Verified sender email address |
| `ARCJET_KEY` | Arcjet API key for runtime security |

---

## Scripts

```bash
npm run dev      # Start with nodemon (development)
npm start        # Start production server
```

---

## Deployment

Deployed on **Vercel** with Node.js 20 runtime — pinned via `engines` in `package.json` to ensure version consistency between local dev and production.

CI/CD via **GitHub Actions** — every push to `main` triggers a build validation workflow before auto-deployment.

---

## Author

Built with ☕ by **Abhishek Vishwakarma**

[![Portfolio](https://img.shields.io/badge/Portfolio-000000?style=flat&logo=vercel&logoColor=white)](https://portfolio-tau-lilac-98.vercel.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat&logo=linkedin&logoColor=white)](https://linkedin.com/in/abhishek-vishwakarma)
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=flat&logo=github&logoColor=white)](https://github.com/codewithabhi2003)
