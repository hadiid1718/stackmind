# StackMind Backend (Module 1 + Module 3)

Authentication/User Management service with embedded Ingestion Module (Data Integrations).

## Tech Stack

- Node.js + Express.js
- MongoDB + Mongoose
- Passport.js (Google OAuth2 + GitHub OAuth2)
- JWT access (15m) + refresh (7d) tokens in httpOnly cookies
- Zod validation
- Nodemailer for email verification and password reset
- express-rate-limit for auth route protection
- KafkaJS for publishing normalized ingestion events
- KafkaJS consumer groups for Knowledge Graph materialization
- node-cron for 15-minute polling jobs
- AES-256-GCM encryption for stored integration credentials

## File Structure

```text
Backend/
  .env.example
  package.json
  README.md
  src/
    app.js
    server.js
    config/
      db.js
      env.js
      passport.js
    controllers/
      auth.controller.js
      oauth.controller.js
      organisation.controller.js
    middleware/
      auth.middleware.js
      error.middleware.js
      rateLimit.middleware.js
      rbac.middleware.js
      validate.middleware.js
    models/
      PasswordResetToken.js
      RefreshToken.js
      User.js
      VerificationToken.js
    ingestion/
      config/
        kafka.js
      controllers/
        credential.controller.js
        webhook.controller.js
      jobs/
        pollScheduler.js
      middleware/
        requestContext.middleware.js
        webhookTrust.middleware.js
      models/
        IntegrationCredential.js
      normalizers/
        eventNormalizer.js
      providers/
        confluence.provider.js
        github.provider.js
        jira.provider.js
        providerHttpClient.js
        slack.provider.js
      publishers/
        kafkaPublisher.js
      routes/
        credential.routes.js
        webhook.routes.js
      services/
        encryption.service.js
        eventIngestion.service.js
        integrationCredential.service.js
        polling.service.js
        retry.service.js
      utils/
        ipAllowlist.js
      validators/
        credential.schemas.js
      index.js
      ingestion.smoke.js
    ai/
      README.md
      ai.smoke.js
      clients/
        openai.client.js
        redis.client.js
      controllers/
        ai.controller.js
      models/
        RagChunk.js
      prompts/
        queryPrompt.builder.js
      repositories/
        vectorSearch.repository.js
      routes/
        ai.routes.js
      services/
        graphContext.service.js
        ragQuery.service.js
      validators/
        ai.schemas.js
      index.js
    billing/
      README.md
      billing.smoke.js
      controllers/
        billing.controller.js
      index.js
      middleware/
        stripeWebhook.middleware.js
        usageMetering.middleware.js
      models/
        Subscription.js
        UsageRecord.js
      routes/
        billing.routes.js
        stripeWebhook.routes.js
      services/
        stripe.service.js
        subscription.service.js
        usage.service.js
      validators/
        billing.schemas.js
    tests/
      billing.schemas.test.js
      usage.service.test.js
    routes/
      auth.routes.js
      index.js
      oauth.routes.js
      organisation.routes.js
    utils/
      appError.js
      asyncHandler.js
      cookie.js
      hash.js
      mailer.js
      token.js
    validators/
      auth.schemas.js
```

## Routes

Base prefix: `/api/v1/auth`

- `POST /register` - Register user with bcrypt-hashed password (12 rounds)
- `POST /login` - Login, issue access + refresh cookies
- `POST /refresh` - Rotate refresh token and issue new cookie pair
- `POST /logout` - Revoke refresh token and clear cookies
- `GET /me` - Get current authenticated user (requires access token)
- `GET /verify-email/:token` - Verify email via time-limited token
- `POST /resend-verification` - Resend verification email
- `POST /forgot-password` - Send password reset email (time-limited token)
- `POST /reset-password` - Reset password and revoke active sessions

OAuth routes:

- `GET /api/v1/auth/oauth/google`
- `GET /api/v1/auth/oauth/google/callback`
- `GET /api/v1/auth/oauth/github`
- `GET /api/v1/auth/oauth/github/callback`

Module 3 ingestion routes:

- `POST /api/v1/webhooks/github`
- `POST /api/v1/webhooks/jira`
- `POST /api/v1/webhooks/slack`
- `GET /api/v1/credentials`
- `GET /api/v1/credentials/:provider`
- `PUT /api/v1/credentials/:provider`
- `DELETE /api/v1/credentials/:provider`

Module 4 knowledge graph routes:

- `GET /api/v1/graph/node/:id`
- `GET /api/v1/graph/causal-chain/:node_id?max_hops=5`
- `GET /api/v1/graph/decisions?org_id=<org-id>&file=<file-path>`

Module 5 AI query route:

- `POST /api/v1/ai/query/stream` (SSE stream: `token`, `meta`, `done`, `error` events)

Notification integration route:

- `POST /api/v1/notifications/publish` (authenticated; publishes to Kafka topic `events.notifications`)

Billing routes:

- `POST /api/v1/billing/checkout/pro`
- `POST /api/v1/billing/portal`
- `GET /api/v1/billing/subscriptions/:org_id`
- `GET /api/v1/billing/usage/:org_id`
- `POST /api/v1/billing/usage/ai-query`

Stripe webhook route:

- `POST /webhooks/stripe`

Automatic notification events are also emitted on selected flows:

- invitation accepted (`INVITATION_ACCEPTED`)
- member role changed (`MEMBER_ROLE_CHANGED`, `MEMBER_ROLE_UPDATED`)
- auth security alerts (`AUTH_LOGIN_FAILED`, `AUTH_UNVERIFIED_LOGIN_BLOCKED`, `AUTH_PASSWORD_RESET`)

Ingestion event schema published to Kafka topic `events.ingestion`:

- `{ org_id, source, event_type, content, metadata, timestamp }`

Webhook trust model (layered):

- Shared-secret signature verification (GitHub/Jira/Slack)
- Source IP allowlists (CIDR supported)
- Webhook deliveries must include `X-Org-Id` or `X-ContextOS-Org-Id` so events can be normalised with the correct `org_id`

## RBAC

Supported roles:

- `owner`
- `admin`
- `member`
- `viewer`

Middleware:

- `requireAuth` validates JWT access token from bearer or cookie
- `requireRole(...roles)` enforces role hierarchy

## Run Locally

1. Copy `.env.example` to `.env.development` and fill all values.
2. Install dependencies:
   - `npm install`
3. Run service:
   - `npm run dev`

Embedded ingestion env tips:

- `INGESTION_ENABLED` defaults to `true`; set it to `false` to disable both ingestion routes and the polling scheduler.
- `MOCK_KAFKA` defaults to `true`; set it to `false` only when Kafka is available locally.
- `WEBHOOK_BASE_URL` should be the public callback base used by GitHub, Jira, and Slack webhook registrations.
- `APP_ORIGIN` should match your frontend origin for CORS and auth redirect flows.
- `MAIL_FROM` controls the sender identity used by email verification and password-reset messages.

Shared runtime variables:

- `APP_ORIGIN` (default `http://localhost:3000`)
- `MAIL_FROM` (default `ContextOS <noreply@contextos.io>`)
- `WEBHOOK_BASE_URL` (default `http://localhost:4001/api/v1/webhooks`)
- `INGESTION_ENABLED` (default `true`)

Module 3 environment variables:

- `KAFKA_BROKERS` (comma-separated)

## Dockerized Environments (Development and Production)

This repository supports separate Docker setups for development and production with explicit database URL switching.

### Files

- `Dockerfile`
- `docker-compose.yaml` (development default)
- `docker-compose.dev.yaml`
- `docker-compose.prod.yaml`
- `.env.development`
- `.env.production`
- `scripts/mongo/init-dev.js`

### Environment Variable Switching (`DATABASE_URL`)

The backend now resolves DB connection in this order:

1. `DATABASE_URL`
2. `MONGO_URI`
3. built-in local fallback

That allows the same app image to run in both environments without code changes.

Development example:

```env
DATABASE_URL=mongodb://mongodb:27017/stackmind_dev?directConnection=true
MONGO_URI=mongodb://mongodb:27017/stackmind_dev?directConnection=true
```

Production example:

```env
DATABASE_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?appName=Stackmind
MONGO_URI=${DATABASE_URL}
```

### Development (Local Docker)

Run local app + local MongoDB:

```bash
docker compose -f docker-compose.dev.yaml up --build
```

Or using default compose file:

```bash
docker compose up --build
```

What runs in dev:

- `app` service on `http://localhost:4001`
- `mongodb` on `localhost:27017`

Ephemeral dev/testing behavior:

- MongoDB dev data is stored in `tmpfs` so it resets when containers are recreated.
- `scripts/mongo/init-dev.js` creates isolated `stackmind_dev` and `stackmind_test` DBs automatically.

### Production (Cloud/Serverless MongoDB)

Run production app container with external serverless MongoDB connection string injected via env:

```bash
DATABASE_URL='mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?appName=Stackmind' \
docker compose -f docker-compose.prod.yaml up --build -d
```

Important production notes:

- No local MongoDB container is used in production compose.
- Cloud/serverless MongoDB is external and accessed through `DATABASE_URL`.
- Keep `DATABASE_URL` and secrets in a secret manager or CI/CD environment variables.

### Quick Verify

```bash
docker compose -f docker-compose.dev.yaml ps
curl http://localhost:4001/health
```

If the app starts successfully, it is using the configured `DATABASE_URL` for the active environment.

- `KAFKA_CLIENT_ID`
- `KAFKA_TOPIC`
- `MOCK_KAFKA` (default `true`)
- `NOTIFICATIONS_ENABLED` (default `true`)
- `NOTIFICATION_KAFKA_TOPIC` (default `events.notifications`)
- `BILLING_ENABLED` (default `true`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_CUSTOMER_PORTAL_RETURN_URL` (default `http://localhost:3000/settings/billing`)
- `PRO_PRICE_USD` (default `49`)
- `FREE_MAX_USERS` (default `5`)
- `FREE_AI_QUERY_LIMIT` (default `100`)
- `PRO_AI_QUERY_LIMIT` (default `5000`)
- `ENTERPRISE_AI_QUERY_LIMIT` (default `0`)
- `ENTERPRISE_MAX_USERS` (default `0`)
- `GRAPH_ENABLED` (default `true`)
- `GRAPH_KAFKA_TOPIC` (default `events.ingestion`)
- `GRAPH_KAFKA_CLIENT_ID` (default `contextos-knowledge-graph-service`)
- `GRAPH_CONSUMER_GROUP_ID` (required in production)
- `GRAPH_MOCK_KAFKA` (default inherits `MOCK_KAFKA`)
- `ENCRYPTION_KEY` (64-char hex key for AES-256-GCM)
- `GITHUB_WEBHOOK_SECRET`
- `JIRA_WEBHOOK_SECRET`
- `SLACK_SIGNING_SECRET`
- `GITHUB_WEBHOOK_IP_ALLOWLIST` (comma-separated CIDR/IP)
- `JIRA_WEBHOOK_IP_ALLOWLIST` (comma-separated CIDR/IP)
- `SLACK_WEBHOOK_IP_ALLOWLIST` (comma-separated CIDR/IP)
- `POLL_CRON` (default `*/15 * * * *`)
- `POLL_LOOKBACK_MINUTES` (default `15`)
- `RETRY_MAX_RETRIES` (default `4`)
- `RETRY_BASE_DELAY_MS` (default `250`)
- `RETRY_MAX_DELAY_MS` (default `10000`)
- `GITHUB_API_BASE_URL` (default `https://api.github.com`)
- `JIRA_API_BASE_URL` (default `https://your-domain.atlassian.net`)
- `SLACK_API_BASE_URL` (default `https://slack.com/api`)
- `CONFLUENCE_API_BASE_URL` (default `https://your-domain.atlassian.net/wiki/rest/api`)

Module 5 environment variables:

- `AI_QUERY_ENABLED` (default `true`)
- `OPENAI_API_KEY` (required in production)
- `AI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `AI_COMPLETION_MODEL` (default `gpt-4o`)
- `AI_TOP_K` (default `10`)
- `AI_VECTOR_CANDIDATES` (default `150`)
- `AI_CHUNK_COLLECTION` (default `rag_chunks`)
- `AI_VECTOR_INDEX_NAME` (default `rag_chunks_vector_idx`)
- `AI_VECTOR_EMBEDDING_PATH` (default `embedding`)
- `AI_GRAPH_CONTEXT_ENABLED` (default `true`)
- `AI_GRAPH_CONTEXT_NODES` (default `3`)
- `AI_GRAPH_CONTEXT_HOPS` (default `2`)
- `GRAPH_SERVICE_BASE_URL` (default `${API_BASE_URL}/api/v1/graph`)
- `AI_GRAPH_SERVICE_TIMEOUT_MS` (default `5000`)
- `AI_REDIS_ENABLED` (default `true`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`)
- `AI_CACHE_TTL_SECONDS` (default `600`)

Module 8 API Gateway:

- `npm run gateway:dev` starts the API Gateway service
- `npm run gateway:start` starts API Gateway with file watch
- `npm run gateway:smoke` prints configured proxy/readiness targets
- `GET /health?probe=liveness` returns liveness only
- `GET /health` (or `?probe=readiness`) runs upstream readiness checks

Gateway upstream proxy routes:

- `/api/v1/auth` -> auth service (public)
- `/api/v1/webhooks` -> ingestion service webhooks (public)
- `/api/v1/credentials` -> ingestion service (JWT + per-org rate limit)
- `/api/v1/graph` -> graph service (JWT + per-org rate limit)
- `/api/v1/query` -> query service (rewritten to `/api/v1/ai`)
- `/api/v1/ai` -> query service alias
- `/api/v1/notifications` -> notification service
- `/api/v1/billing` -> billing service

Gateway environment variables:

- `GATEWAY_PORT` (default `4000`)
- `GATEWAY_CORS_ORIGIN` (default `APP_ORIGIN`)
- `GATEWAY_RATE_LIMIT_PER_MINUTE` (default `1000`)
- `GATEWAY_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `GATEWAY_RATE_LIMIT_PREFIX` (default `gateway:rate`)
- `GATEWAY_UPSTREAM_TIMEOUT_MS` (default `2000`)
- `AUTH_SERVICE_URL`
- `INGESTION_SERVICE_URL`
- `GRAPH_SERVICE_URL`
- `QUERY_SERVICE_URL`
- `NOTIFICATION_SERVICE_URL`
- `BILLING_SERVICE_URL`

Health check:

- `GET /health`

Health response includes `ingestion` runtime status:

- `enabled`
- `kafkaConnected`
- `schedulerStarted`
- `startupError`
- `updatedAt`

Health response also includes `graph` runtime status:

- `enabled`
- `kafkaConnected`
- `consumerRunning`
- `processedEvents`
- `startupError`
- `updatedAt`

Run knowledge graph smoke test:

- `npm run graph:smoke`

Run AI query module smoke test:

- `npm run ai:smoke`

Run notification publisher smoke test:

- `npm run notifications:smoke`

Run billing smoke test:

- `npm run billing:smoke`

Stripe configuration guide:

1. Create a Stripe Product for the Pro plan.
2. Create a recurring monthly Price set to `$49` per user.
3. Copy the Price ID into `STRIPE_PRO_PRICE_ID`.
4. Enable Customer Portal in Stripe and set the return URL.
5. Add a webhook endpoint pointing to `POST /webhooks/stripe`.
6. Subscribe the webhook to `checkout.session.completed`, `customer.subscription.deleted`, and `invoice.payment_failed`.
7. Store the webhook signing secret in `STRIPE_WEBHOOK_SECRET`.
