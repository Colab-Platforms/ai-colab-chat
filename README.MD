# AI Colab Chat

> An AI-powered, multi-model collaborative chat platform with subscription management, usage tracking, and PWA support.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Environment Variables](#environment-variables)
- [API Routes](#api-routes)
- [Project Structure](#project-structure)
- [PWA Support](#pwa-support)
- [License](#license)

---

## Overview

**AI Colab Chat** is a full-stack, production-ready chat application that lets users interact with multiple AI models (OpenAI and others) through a clean, modern interface. It features real-time streaming responses, folder-based chat organisation, file attachments, public chat sharing, a token wallet system, tiered subscription plans, and a role-based admin panel - all wrapped in a Progressive Web App.

---

## Features

### Core Chat

- Multi-model AI chat with configurable model providers (OpenAI-compatible)
- Real-time streaming responses via **Server-Sent Events (SSE)**
- Parallel multi-model chatting (compare responses simultaneously)
- Diverse **Chat Capabilities**: Default (Text), Web Search, and Image Generation modes
- Voice Input via integrated microphone speech-to-text
- Markdown rendering with syntax-highlighted code blocks
- File/image attachment support per message
- Comprehensive message controls: Edit messages, regenerate, branch conversation history (version control), and Like/Dislike responses

### Organisation

- Folder-based chat management (create, rename, delete folders)
- Pin favourite chats to the top of the sidebar
- Archive and soft-delete chats
- Public chat sharing via unique share links

### Subscriptions & Billing

- Tiered subscription **Plans** (Monthly / Quarterly / Yearly billing cycles)
- Per-user **Token Wallet** tracking prompt & completion token usage
  - **Model Multipliers**: High-tier models (e.g., Claude 3 Opus) can apply configurable token multipliers (e.g., 3x) to accurately deduct equivalent usage from the user's unified wallet.
  - **Rolling Context Window**: Conversations dynamically drop older messages when approaching token affordability limits, ensuring users never hit hard token walls while preserving the newest context.
- Automated subscription expiry and token-reset **cron jobs**
- Usage logs per model, per user

### Auth & RBAC

- JWT-based authentication (register, login, refresh)
- Cloudinary integration with automatic stale-thumbnail deletion on profile updates
- Role-based access control: **User**, **Admin**, **Super Admin**
- Super Admin manages model providers and API keys

### Admin Panel

- Manage AI models and model providers
- View and manage subscription plans
- Monitor usage logs across all users

### PWA

- Installable as a Progressive Web App on desktop and mobile
- Service Worker for offline-readiness
- Web App Manifest with theme colour and icons

---

## Tech Stack

| Layer            | Technology                                  |
| ---------------- | ------------------------------------------- |
| **Frontend**     | Next.js 16, React 19, TypeScript            |
| **Styling**      | Tailwind CSS v4, shadcn/ui (Radix UI)       |
| **Backend**      | Node.js, Express 5, TypeScript              |
| **Database**     | PostgreSQL                                  |
| **ORM**          | Prisma 7                                    |
| **AI SDK**       | OpenAI Node SDK                             |
| **Auth**         | JSON Web Tokens (JWT), bcrypt               |
| **File Uploads** | Multer                                      |
| **Streaming**    | Server-Sent Events (SSE)                    |
| **Cron Jobs**    | node-cron                                   |
| **Security**     | Helmet, CORS, XSS sanitisation, compression |

---

## Architecture

```
ai-colab-chat/
├── backend/       # Express REST API
│   ├── prisma/    # Schema, migrations, seeds
│   └── src/
│       ├── modules/   # Feature modules (chat, user, auth, …)
│       ├── middlewares/
│       ├── crons/
│       └── utils/
└── frontend/      # Next.js App Router
    ├── app/
    ├── components/
    ├── context/
    └── lib/
```

The backend exposes a RESTful API under `/api/*`. The frontend is a standalone Next.js application that communicates with the backend over HTTP/SSE.

---

## Database Schema

```
User ──< UserRole >── Role
User ──< Folder ──< Chat ──< Message ──< Attachment
                        └──< ModelResponse >── Model >── ModelProvider
User ──< Subscription >── Plan
User ── UserWallet
User ──< UsageLog >── Model
```

Key models: `User`, `Role`, `Chat`, `Message`, `ModelResponse`, `Model`, `ModelProvider`, `Folder`, `Attachment`, `Plan`, `Subscription`, `UserWallet`, `UsageLog`.

---

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm or pnpm

---

### Backend Setup

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Run database migrations
npm run db:migrate

# 4. Seed initial data (roles, plans, model providers, super admin)
npm run db:seed

# 5. Start development server
npm run dev
```

The API will be available at `http://localhost:5000`.

---

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env.local

# 3. Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable                       | Description                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                 | PostgreSQL connection string                                                 |
| `JWT_SECRET`                   | Secret key for signing JWTs                                                  |
| `JWT_EXPIRES_IN`               | JWT expiry duration (e.g. `7d`)                                              |
| `PORT`                         | Server port (default `5000`)                                                 |
| `FRONTEND_URL`                 | Frontend origin for CORS                                                     |
| `GOOGLE_CLIENT_ID`             | Google OAuth client ID                                                       |
| `GOOGLE_CLIENT_SECRET`         | Google OAuth client secret                                                   |
| `GOOGLE_CALLBACK_URL`          | Backend callback URL (e.g. `http://localhost:5000/api/auth/google/callback`) |
| `FRONTEND_GOOGLE_CALLBACK_URL` | Frontend callback URL (e.g. `http://localhost:3000/auth/google/callback`)    |

### Frontend (`frontend/.env.local`)

| Variable              | Description          |
| --------------------- | -------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

## Google OAuth Setup

### 1) Add environment variables

Backend (`backend/.env`):

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
FRONTEND_GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

For production, replace localhost values with your live domains.

### 2) Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or choose a project.
3. Open **APIs & Services > OAuth consent screen**.
4. Configure app name, support email, and developer contact.
5. Add scopes: `openid`, `email`, `profile`.
6. Add test users if app is in testing mode.
7. Open **APIs & Services > Credentials** and create **OAuth client ID**.
8. Choose **Web application**.
9. Add Authorized redirect URI for backend callback:

- `http://localhost:5000/api/auth/google/callback` (development)
- `https://your-backend-domain/api/auth/google/callback` (production)

10. Save and copy Client ID / Client Secret to backend env.

### 3) Verify URL alignment

- Google redirect URI must exactly match `GOOGLE_CALLBACK_URL`.
- Backend redirect target after success/failure must match `FRONTEND_GOOGLE_CALLBACK_URL`.
- Frontend Google callback page path is `/auth/google/callback`.

### 4) Local test flow

1. Start backend and frontend.
2. Open login or register page.
3. Click **Continue with Google**.
4. Complete Google consent.
5. Ensure you are redirected back and logged in.

---

## API Routes

| Prefix                 | Description                    | Access      |
| ---------------------- | ------------------------------ | ----------- |
| `/api/auth`            | Register, login, refresh token | Public      |
| `/api/users`           | User profile, management       | User        |
| `/api/folders`         | Folder CRUD                    | User        |
| `/api/chats`           | Chat CRUD, share, archive      | User        |
| `/api/messages`        | Message CRUD                   | User        |
| `/api/model-responses` | AI response streaming          | User        |
| `/api/attachments`     | File upload & retrieval        | User        |
| `/api/wallet`          | Token balance                  | User        |
| `/api/subscriptions`   | Subscribe, cancel, status      | User        |
| `/api/plans`           | Plan listing & management      | Admin       |
| `/api/usage-logs`      | Usage analytics                | Admin       |
| `/api/models`          | AI model management            | Admin       |
| `/api/model-providers` | Provider & API key management  | Super Admin |

---

## Project Structure

```
backend/src/
├── index.ts               # App entry point
├── routes.ts              # Root router
├── modules/
│   ├── auth/              # JWT auth (register, login)
│   ├── user/              # User profile & management
│   ├── chat/              # Chat CRUD + share/archive
│   ├── message/           # Message CRUD + edit history
│   ├── model-response/    # AI call + SSE streaming
│   ├── folder/            # Folder organisation
│   ├── attachment/        # File uploads
│   ├── wallet/            # Token wallet
│   ├── subscription/      # Subscription lifecycle
│   ├── plan/              # Subscription plans
│   ├── usage-log/         # Token usage logs
│   ├── model/             # AI model records
│   └── model-provider/    # Provider config & API keys
├── middlewares/
│   ├── authMiddleware.ts  # JWT guard + RBAC
│   ├── errorHandler.ts
│   ├── notFoundHandler.ts
│   ├── sanitize.ts        # XSS sanitisation
│   └── uploadMiddleware.ts
├── crons/
│   ├── subscriptionExpiry.ts
│   └── tokenReset.ts
└── utils/

frontend/
├── app/
│   ├── (chat)/            # Main chat layout + pages
│   │   ├── page.tsx       # Home / new chat
│   │   ├── c/[chatId]/    # Individual chat
│   │   └── profile/       # User profile
│   ├── login/
│   ├── register/
│   └── share/[shareId]/   # Public shared chat view
├── components/
│   ├── chat/              # ChatInput, MessageList, MessageBubble, ModelSelector
│   ├── sidebar/           # Navigation sidebar
│   ├── admin/             # Admin panel
│   ├── dashboard/         # DataTable, ConfirmDialog
│   └── pwa/               # ServiceWorker, InstallPrompt
├── context/
│   ├── auth-context.tsx
│   └── theme-context.tsx
└── lib/
    ├── api.ts             # Axios instance
    └── services.ts        # API service calls
```

---

## PWA Support

AI Colab Chat is installable as a Progressive Web App:

- **Service Worker** (`/public/sw.js`) handles caching and offline support.
- **Web App Manifest** generated at `/app/manifest.ts` defines app name, icons, theme colour, and display mode.
- SSE streaming requests are excluded from the service worker fetch interception to ensure real-time AI responses work correctly.
