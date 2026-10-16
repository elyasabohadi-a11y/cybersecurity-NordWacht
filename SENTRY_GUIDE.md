# Sentry Setup Guide (`SENTRY_GUIDE.md`)

Comprehensive, step-by-step guide for setting up and maintaining **Sentry** observability, error tracking, and user feedback loops in the **NordWacht** platform.

---

## 1. Overview & Architecture

Sentry captures runtime exceptions, performance transactions, and session replays across all layers of the Next.js application:
- **Client Runtime (`instrumentation-client.ts`)**: Browser exceptions, UI errors, user feedback widget, and Session Replays.
- **Server Runtime (`instrumentation.ts`)**: API route errors, Server Components, Server Actions, and SSR exceptions.
- **Build Pipeline (`next.config.ts`)**: Source map uploading, release tracking, and tunnel routing via `/monitoring` to prevent ad-blocker filtering.

---

## 2. NPM Installation

Install the official Sentry Next.js SDK into the project dependencies:

### Standard Package Installation
```bash
# Using npm
npm install @sentry/nextjs

# Using pnpm
pnpm add @sentry/nextjs

# Using yarn
yarn add @sentry/nextjs
```

### Alternative: Sentry Wizard
You can also run the official setup wizard to automatically verify dependencies:
```bash
npx @sentry/wizard@latest -i nextjs
```

---

## 3. Sentry Account & Credentials Setup

1. **Sign In / Organization**:
   - Log in at [sentry.io](https://sentry.io/).
   - Organization slug: `vitruvian-flow` (or your team org).
2. **Project Creation**:
   - Platform: **Next.js**.
   - Project Name: `cybersecurity-nordwacht`.
   - Set alert frequency: **Alert on every new issue**.
3. **Client DSN**:
   - Navigate to **Settings** > **Projects** > `cybersecurity-nordwacht` > **Client Keys (DSN)**.
   - Copy the ingestion DSN URL: `https://<public_key>@<org_id>.ingest.sentry.io/<project_id>`.
4. **Auth Token (Source Map Uploads & CI/CD Releases)**:
   - Navigate to **Settings** > **Developer Settings** > **Internal Integrations** (or **Auth Tokens**).
   - Generate a token with scopes:
     - `project:read`
     - `project:releases`
     - `event:read`
     - `org:read`
   - Store the token securely (`sntrys_...`).

---

## 4. Environment Variables Configuration (`.env`)

Add the following variables to `.env.local` for local development, and configure them in your deployment environment (e.g., Vercel, Railway, Docker):

```bash
# ==============================================================================
# Sentry Configuration
# ==============================================================================

# Client & Server Ingestion DSN (Safe for client exposure)
NEXT_PUBLIC_SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"

# Sentry Auth Token for uploading source maps during production build
# (Do NOT prefix with NEXT_PUBLIC_ - keep secret)
SENTRY_AUTH_TOKEN="sntrys_your_auth_token_here"

# Organization & Project slugs matching next.config.ts
SENTRY_ORG="vitruvian-flow"
SENTRY_PROJECT="cybersecurity-nordwacht"

# Environment Tag
NEXT_PUBLIC_APP_ENV="development" # or "production", "staging"
```

> [!WARNING]
> Ensure `.env.local` is added to `.gitignore`. Never commit `SENTRY_AUTH_TOKEN` to version control.

---

## 5. Core Configuration & `Sentry.init` Implementation

### 5.1. Client Configuration (`instrumentation-client.ts`)

Configures browser error tracking, user feedback widgets, and session replay with privacy masking:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,

  // Performance Tracing: Sample 100% in dev, 20% in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Session Replays
  replaysSessionSampleRate: 0.1, // 10% sample rate for normal sessions
  replaysOnErrorSampleRate: 1.0,  // 100% sample rate on errors

  integrations: [
    // Browser Session Replay with PII masking
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),

    // In-App User Feedback Dialog
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      isNameRequired: true,
      isEmailRequired: true,
      buttonLabel: "Report Security Issue / Bug",
      submitButtonLabel: "Send Feedback",
      formTitle: "Report a Bug",
      autoInject: true, // Floating feedback widget
    }),
  ],

  // Scrub sensitive headers and tokens
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    return event;
  },

  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Network request failed",
    "Load failed",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

---

### 5.2. Server & Edge Configuration (`instrumentation.ts`)

Configures server-side error capturing and request hooks:

```typescript
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
          delete event.request.headers["x-api-key"];
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
```

---

### 5.3. Build & Tunnel Configuration (`next.config.ts`)

Wraps Next.js config with Sentry plugins for source map handling and ad-blocker circumvention:

```typescript
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/unsubscribe",
        destination: "/unsubscribed",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project settings
  org: process.env.SENTRY_ORG || "vitruvian-flow",
  project: process.env.SENTRY_PROJECT || "cybersecurity-nordwacht",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppresses output logs in bundling
  silent: !process.env.CI,

  // Upload wider set of source maps for clean stack traces
  widenClientFileUpload: true,

  // Route requests via internal Next.js rewrite to prevent ad-blockers
  tunnelRoute: "/monitoring",

  // Hide source maps from public production bundles
  hideSourceMaps: true,

  // Tree-shake Sentry logger statements to minimize bundle weight
  disableLogger: true,
});
```

---

## 6. User Feedback Integration

Sentry provides multiple mechanisms to collect feedback directly linked to errors:

### Floating Feedback Widget (Automatic)
Enabled by `Sentry.feedbackIntegration({ autoInject: true })` in `instrumentation-client.ts`. A button appears in the corner of the UI.

### Manual Feedback Trigger (Button / Modal)
To trigger the feedback modal programmatically from a custom UI button:

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";

export function SecurityFeedbackTrigger() {
  const handleClick = () => {
    const feedback = Sentry.getFeedback();
    if (feedback) {
      feedback.openDialog();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded"
    >
      Report Threat / Issue
    </button>
  );
}
```

### Attaching User Context
Associate logged-in users with Sentry sessions:

```typescript
import * as Sentry from "@sentry/nextjs";

export function setSentryUser(user: { id: string; email: string; role?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}
```

---

## 7. Security & PII Protection Standards

Because **NordWacht** processes security telemetry, data privacy is paramount:
1. **Header Sanitization**: `Authorization`, `Cookie`, and `X-API-Key` headers are scrubbed via `beforeSend`.
2. **Session Replay Privacy**: `maskAllText: true` and `blockAllMedia: true` prevent sensitive dashboard data from being recorded.
3. **Explicit Element Masking**: Sensitive elements can be masked with the `sentry-mask` CSS class or completely hidden with `sentry-block`:
   ```html
   <input type="text" className="sentry-block" />
   ```

---

## 8. Verification & Diagnostic Testing

To verify the setup:

1. **Trigger a Test Exception**:
   Add a temporary test button to verify error delivery:
   ```tsx
   <button onClick={() => { throw new Error("NordWacht Sentry Verification Test"); }}>
     Test Sentry Ingestion
   </button>
   ```
2. **Inspect Network**:
   Open browser DevTools > Network tab, click the test button, and verify a request to `/monitoring` or `*.ingest.sentry.io` succeeds with HTTP 200.
3. **Verify in Sentry Dashboard**:
   - Check **Issues** to confirm the event arrived with readable stack trace.
   - Check **User Feedback** to confirm feedback submissions appear.
