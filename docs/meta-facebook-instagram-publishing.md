# Meta (Facebook + Instagram) Publishing Setup

This project now supports **real Meta Graph API publishing** from `backend/main.py` for:
- Facebook Page posts (`/feed`, `/photos`, `/videos`)
- Instagram Business posts (`/media`, `/media_publish`)

---

## 1) What you need before coding

- A Facebook account with access to a **Facebook Page**
- An Instagram **Professional** account (Business or Creator)
- Instagram account linked to the same Facebook Page
- A Meta Developer account

Use these official docs:
- [Meta App Dashboard](https://developers.facebook.com/apps/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Instagram Graph API overview](https://developers.facebook.com/docs/instagram-api/)
- [Facebook Pages API overview](https://developers.facebook.com/docs/pages-api/)
- [Access token debugger](https://developers.facebook.com/tools/debug/accesstoken/)

---

## 2) Step-by-step Meta App setup

1. Go to [Meta for Developers](https://developers.facebook.com/) and create an app.
2. Choose app type: **Business**.
3. In your app, add products:
   - **Facebook Login for Business**
   - **Instagram Graph API**
4. Add valid OAuth redirect URI(s) in Facebook Login settings (your frontend callback URL).
5. Generate a **User access token** with required scopes in Graph API Explorer.
6. Exchange it for a **long-lived user token** (60 days).
7. Exchange long-lived user token for a **Page access token**.
8. Get your IDs:
   - Facebook Page ID
   - Instagram Business Account ID
9. Put those values into `backend/.env`.
10. Switch app mode from **Development** to **Live** once App Review is approved.

---

## 3) Required permissions (scopes)

For publishing to Facebook Pages:
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `pages_manage_metadata`

For publishing to Instagram Business:
- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list` (needed to discover IG business account via page)

Optional but commonly requested:
- `business_management`

Important:
- In development mode, only app roles (admin/tester/developer) can use the app.
- For real users in production, submit these permissions via **App Review**.

---

## 4) How to get each env value (exact links)

### `META_PAGE_ACCESS_TOKEN`
1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your app.
3. Generate User token with scopes above.
4. Get long-lived token (via token exchange endpoint).
5. Get Page token using:
   - `GET /me/accounts`
6. Copy the selected page `access_token`.

### `META_PAGE_ID`
- From Graph API Explorer, call:
  - `GET /me/accounts`
- Copy the page `id`.

### `META_IG_BUSINESS_ACCOUNT_ID`
- Call:
  - `GET /{page-id}?fields=instagram_business_account`
- Copy `instagram_business_account.id`.

### `META_GRAPH_API_VERSION`
- Use latest stable version, for example `v22.0`.
- Version list: [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/)

---

## 5) Environment setup (what to paste)

Add this to `backend/.env`:

```env
META_PAGE_ACCESS_TOKEN=EAAB...your_page_access_token...
META_PAGE_ID=123456789012345
META_IG_BUSINESS_ACCOUNT_ID=17841400000000000
META_GRAPH_API_VERSION=v22.0
```

Also keep existing values:

```env
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_AUTHOR_URN=...
LINKEDIN_API_VERSION=202405
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

---

## 6) Implemented backend behavior in this repo

Implemented in `backend/main.py`:
- Reads new Meta env vars
- `POST /connect/meta`
  - Shows **Meta Graph API** when env is configured
  - Falls back to mock label if env is missing
- `POST /publish`
  - If platform is `facebook`:
    - text post -> `/{page-id}/feed`
    - image URL -> `/{page-id}/photos`
    - video URL -> `/{page-id}/videos`
  - If platform is `instagram`:
    - create container -> `/{ig-business-id}/media`
    - publish container -> `/{ig-business-id}/media_publish`

Notes:
- Instagram Graph publishing requires **publicly accessible media URLs**.
- Data URLs (base64 blobs) are not accepted for Instagram and are rejected for Facebook in this integration.

---

## 7) Example API calls

### Publish to Facebook (text)

```bash
curl -X POST "https://graph.facebook.com/v22.0/{page-id}/feed" \
  -d "message=Hello from FlowPilot" \
  -d "access_token={page-access-token}"
```

### Publish image to Facebook

```bash
curl -X POST "https://graph.facebook.com/v22.0/{page-id}/photos" \
  -d "url=https://example.com/image.jpg" \
  -d "caption=Image post from FlowPilot" \
  -d "published=true" \
  -d "access_token={page-access-token}"
```

### Instagram publish flow

1) Create media container:

```bash
curl -X POST "https://graph.facebook.com/v22.0/{ig-business-id}/media" \
  -d "image_url=https://example.com/image.jpg" \
  -d "caption=Instagram post from FlowPilot" \
  -d "access_token={page-access-token}"
```

2) Publish container:

```bash
curl -X POST "https://graph.facebook.com/v22.0/{ig-business-id}/media_publish" \
  -d "creation_id={creation-id}" \
  -d "access_token={page-access-token}"
```

---

## 8) Suggested folder structure

Current implementation is in one backend file, but for scaling use:

```text
backend/
  main.py
  integrations/
    meta/
      client.py
      facebook.py
      instagram.py
      oauth.py
  routes/
    publishing.py
    integrations.py
  models/
    publishing.py
  .env
  .env.example
docs/
  meta-facebook-instagram-publishing.md
```

---

## 9) Deployment guide

### Backend
1. Set env vars in your hosting provider:
   - `META_PAGE_ACCESS_TOKEN`
   - `META_PAGE_ID`
   - `META_IG_BUSINESS_ACCOUNT_ID`
   - `META_GRAPH_API_VERSION`
2. Deploy FastAPI backend.
3. Run a smoke test:
   - `POST /connect/meta`
   - publish one `facebook` and one `instagram` approved content item

### Frontend
1. Ensure frontend points to deployed backend API base URL.
2. Connect Meta from UI.
3. Approve a content item and publish.

### Production checklist
- Use long-lived tokens and rotate before expiry
- Add structured logging for Graph API errors
- Add retry/backoff for transient Meta errors (`5xx`, rate limits)
- Add a scheduled token health check job

---

## 10) Troubleshooting

- `(#10) Application does not have permission`:
  missing scope or App Review approval.
- `Unsupported post request`:
  wrong Page ID / IG Business ID or token does not match asset ownership.
- Instagram publish fails with media errors:
  URL not publicly reachable, unsupported format, or video still processing.

