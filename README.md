# FlowPilot - Marketing Command Center

## Complete Technical Documentation (MVP -> Production Ready Architecture)

---

## 1. System Overview

FlowPilot is a workspace-based marketing automation platform designed to automate:

- Strategy generation
- Content creation
- Approval workflows
- Scheduling and publishing
- Lead generation
- Notifications and reporting

The system operates with minimal manual intervention and is structured around a multi-agent architecture.

---

## 2. Core Architecture

### High-Level Flow

User -> Frontend (Next.js) -> Backend API (FastAPI) -> AI Agents -> Data Layer -> Background Jobs -> Notifications

---

## 3. Technology Stack

### Frontend

- Next.js (App Router)
- Tailwind CSS
- shadcn/ui
- Zustand (state management)
- Recharts (analytics)

### Backend

- FastAPI (Python)
- In-memory database (MVP)

### AI Layer

- Primary LLM (strategy + content)
- Lightweight model (validation + formatting)

### Infrastructure (Future Ready)

- PostgreSQL
- Redis
- Celery / Background workers

---

## 4. Authentication System

### Features

- User Signup
- User Login
- JWT Token Management
- Protected Routes

### Flow

1. User signs up
2. User logs in
3. Token stored (client-side)
4. API requests include token
5. Logout clears session

---

## 5. Workspace System

### Purpose

Each workspace represents a company/project.

### Data

- workspace_id
- company_name
- website
- industry

### Rules

- All system data must be linked to workspace_id

---

## 6. AI Multi-Agent System

### Agent 1: Strategy Engine

Input:

- Company name or URL

Process:

- Competitor discovery
- Market analysis
- Gap identification

Output:

- Target audience
- Content pillars
- Platform strategy

---

### Agent 2: Content Engine

Input:

- Strategy output

Process:

- Generate content calendar (7-30 days)
- Create posts
- Assign media

Output:

- Content items with:
  - text
  - platform
  - media
  - schedule

---

### Agent 3: Publishing Engine

Process:

- Validate content
- Manage approval
- Schedule publishing

---

## 7. Content Lifecycle

DRAFT -> PENDING -> APPROVED -> SCHEDULED -> PUBLISHED -> FAILED -> REJECTED

---

## 8. Calendar & Scheduling System

### Placement

- Command Center (quick view)
- Dedicated Scheduling Page

### Functionality

- Assign publish date/time
- Modify schedules
- Track upcoming posts

### Backend Logic

- Scheduled timestamp stored per content
- Background worker checks and triggers publishing

---

## 9. Media Management System

### Features

- Media storage (image/video)
- Usage tracking
- Duplicate prevention

### Data Structure

- media_id
- url
- type
- used_in

---

## 10. Social Media Integration

### Platforms

- LinkedIn
- Facebook
- Instagram
- Twitter

### Features

- Connect / Disconnect
- Platform selection per content
- Preview before publish

---

## 11. Approval System

### Features

- Approve
- Reject
- Edit

### Rules

- Only approved content can be scheduled
- Only scheduled content can be published

---

## 12. Background Processing

### Responsibilities

- Publish scheduled posts
- Retry failed posts
- Generate leads

### Implementation (MVP)

- Interval-based simulation

### Production Upgrade

- Redis + Celery

---

## 13. Lead Management System

### Data

- name
- email
- source
- status

### Behavior

- Leads generated after publishing events

---

## 14. Notification System

### Types

- In-app notifications
- Email notifications

### Events

- Content ready
- Approval updates
- Publishing status
- New leads

---

## 15. Email Notification System

### Implementation

- SMTP (Gmail)

### Triggers

- Content generation
- Approval actions
- Publishing success/failure
- Lead generation

---

## 16. Logging System

### Purpose

Track all system actions.

### Events

- Content approval
- Publishing
- Errors

---

## 17. API Design

### Standard Response Format

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

### Core Endpoints

Auth:

- POST /signup
- POST /login

Workspace:

- POST /workspace

Strategy:

- POST /strategy

Content:

- POST /content

Approval:

- POST /approve

Scheduling:

- POST /schedule

Publishing:

- POST /publish

Leads:

- GET /leads

Notifications:

- GET /notifications

---

## 18. UI System

### Layout

- Sidebar navigation
- Top navbar
- Dashboard content area

### Pages

- Dashboard
- Command Center
- Strategy
- Content
- Scheduling
- Publishing
- Leads
- Settings
- Profile

---

## 19. UX Requirements

- Clean SaaS UI
- Minimal design
- Smooth transitions
- Loading states
- Toast notifications
- Empty states

---

## 20. Security (MVP)

- Token-based auth
- Route protection
- Basic validation

---

## 21. Deployment (MVP)

Frontend:

- Vercel

Backend:

- Railway / Render

---

## 22. Production Upgrade Path

- PostgreSQL database
- Redis queue system
- Celery workers
- OAuth integrations
- Multi-user system

---

## 23. Final System Flow

Login -> Workspace -> Strategy -> Content -> Approval -> Scheduling -> Publishing -> Leads -> Notifications -> Email -> Logout

---

## 24. Conclusion

FlowPilot is designed as a scalable marketing automation system with modular architecture, enabling transition from MVP to production-ready SaaS.
