import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const runtimeNodeEnv = process.env.NODE_ENV || 'development';
const cwd = process.cwd();
const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(configDir, '..', '..');
const envCandidates = [
  path.resolve(cwd, `.env.${runtimeNodeEnv}`),
  path.resolve(cwd, '.env'),
  path.resolve(backendRoot, `.env.${runtimeNodeEnv}`),
  path.resolve(backendRoot, '.env'),
];
const resolvedEnvPath = envCandidates.find(candidate => existsSync(candidate));

if (resolvedEnvPath) {
  dotenv.config({
    path: resolvedEnvPath,
  });
} else {
  dotenv.config();
}

const isProduction = runtimeNodeEnv === 'production';

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
};

const toCsvArray = value =>
  String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const normalizeProviderDefault = value => {
  const normalized = String(value || 'auto')
    .trim()
    .toLowerCase();
  if (['auto', 'openai', 'gemini'].includes(normalized)) {
    return normalized;
  }

  return 'auto';
};

const assertRequired = key => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
};

if (isProduction) {
  [
    'MONGO_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ORG_INVITATION_SECRET',
    'KAFKA_BROKERS',
    'KAFKA_CLIENT_ID',
    'KAFKA_TOPIC',
    'ENCRYPTION_KEY',
    'GITHUB_WEBHOOK_SECRET',
    'JIRA_WEBHOOK_SECRET',
    'SLACK_SIGNING_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_CALLBACK_URL',
    'GRAPH_CONSUMER_GROUP_ID',
    'ADMIN_JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRO_PRICE_ID',
  ].forEach(assertRequired);

  const aiQueryEnabled = toBoolean(process.env.AI_QUERY_ENABLED, true);
  const aiMockMode = toBoolean(process.env.AI_MOCK_MODE, false);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  if (aiQueryEnabled && !aiMockMode && !hasOpenAi && !hasGemini) {
    throw new Error(
      'Missing required AI provider key: set OPENAI_API_KEY or GEMINI_API_KEY (or enable AI_MOCK_MODE)'
    );
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4001),
  gatewayPort: Number(process.env.GATEWAY_PORT || 4000),
  mongoUri:
    process.env.DATABASE_URL ||
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017/stackmind-auth',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:3000',
  gatewayCorsOrigin:
    process.env.GATEWAY_CORS_ORIGIN ||
    process.env.APP_ORIGIN ||
    'http://localhost:3000',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4001',
  gatewayRateLimitPerMinute: toNumber(
    process.env.GATEWAY_RATE_LIMIT_PER_MINUTE,
    1000
  ),
  gatewayRateLimitWindowMs: toNumber(
    process.env.GATEWAY_RATE_LIMIT_WINDOW_MS,
    60000
  ),
  gatewayRateLimitPrefix:
    process.env.GATEWAY_RATE_LIMIT_PREFIX || 'gateway:rate',
  gatewayUpstreamTimeoutMs: toNumber(
    process.env.GATEWAY_UPSTREAM_TIMEOUT_MS,
    2000
  ),
  authServiceUrl:
    process.env.AUTH_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  ingestionServiceUrl:
    process.env.INGESTION_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  graphServiceUrl:
    process.env.GRAPH_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  queryServiceUrl:
    process.env.QUERY_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  notificationServiceUrl:
    process.env.NOTIFICATION_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  billingServiceUrl:
    process.env.BILLING_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  adminServiceUrl:
    process.env.ADMIN_SERVICE_URL ||
    process.env.API_BASE_URL ||
    'http://localhost:4001',
  ingestionEnabled: process.env.INGESTION_ENABLED !== 'false',
  webhookBaseUrl:
    process.env.WEBHOOK_BASE_URL || 'http://localhost:4001/api/v1/webhooks',
  kafkaBrokers: toCsvArray(
    process.env.KAFKA_BROKERS ||
      process.env.INGESTION_KAFKA_BROKERS ||
      '127.0.0.1:9092'
  ),
  kafkaClientId:
    process.env.KAFKA_CLIENT_ID ||
    process.env.INGESTION_KAFKA_CLIENT_ID ||
    'stackmind-ingestion-service',
  kafkaTopic:
    process.env.KAFKA_TOPIC ||
    process.env.INGESTION_KAFKA_TOPIC ||
    'events.ingestion',
  mockKafka: toBoolean(
    process.env.MOCK_KAFKA ?? process.env.INGESTION_MOCK_KAFKA,
    true
  ),
  graphEnabled: toBoolean(process.env.GRAPH_ENABLED, true),
  graphKafkaTopic:
    process.env.GRAPH_KAFKA_TOPIC ||
    process.env.KAFKA_TOPIC ||
    process.env.INGESTION_KAFKA_TOPIC ||
    'events.ingestion',
  graphKafkaClientId:
    process.env.GRAPH_KAFKA_CLIENT_ID ||
    process.env.KAFKA_CLIENT_ID ||
    process.env.INGESTION_KAFKA_CLIENT_ID ||
    'stackmind-knowledge-graph-service',
  graphConsumerGroupId:
    process.env.GRAPH_CONSUMER_GROUP_ID ||
    `${process.env.KAFKA_CLIENT_ID || 'stackmind'}-graph-consumer-group`,
  graphMockKafka: toBoolean(
    process.env.GRAPH_MOCK_KAFKA ?? process.env.MOCK_KAFKA,
    true
  ),
  notificationsEnabled: toBoolean(process.env.NOTIFICATIONS_ENABLED, true),
  notificationKafkaTopic:
    process.env.NOTIFICATION_KAFKA_TOPIC || 'events.notifications',

  ingestionEncryptionKey:
    process.env.ENCRYPTION_KEY ||
    process.env.INGESTION_ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  githubWebhookSecret:
    process.env.GITHUB_WEBHOOK_SECRET ||
    process.env.INGESTION_GITHUB_WEBHOOK_SECRET,
  jiraWebhookSecret:
    process.env.JIRA_WEBHOOK_SECRET ||
    process.env.INGESTION_JIRA_WEBHOOK_SECRET,
  slackSigningSecret:
    process.env.SLACK_SIGNING_SECRET ||
    process.env.INGESTION_SLACK_SIGNING_SECRET,
  githubWebhookIpAllowlist: toCsvArray(process.env.GITHUB_WEBHOOK_IP_ALLOWLIST),
  jiraWebhookIpAllowlist: toCsvArray(process.env.JIRA_WEBHOOK_IP_ALLOWLIST),
  slackWebhookIpAllowlist: toCsvArray(process.env.SLACK_WEBHOOK_IP_ALLOWLIST),

  pollCron: process.env.POLL_CRON || '*/15 * * * *',
  pollLookbackMinutes: toNumber(process.env.POLL_LOOKBACK_MINUTES, 15),

  retryMaxRetries: toNumber(process.env.RETRY_MAX_RETRIES, 4),
  retryBaseDelayMs: toNumber(process.env.RETRY_BASE_DELAY_MS, 250),
  retryMaxDelayMs: toNumber(process.env.RETRY_MAX_DELAY_MS, 10000),

  githubApiBaseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
  jiraApiBaseUrl:
    process.env.JIRA_API_BASE_URL || 'https://your-domain.atlassian.net',
  slackApiBaseUrl: process.env.SLACK_API_BASE_URL || 'https://slack.com/api',
  confluenceApiBaseUrl:
    process.env.CONFLUENCE_API_BASE_URL ||
    'https://your-domain.atlassian.net/wiki/rest/api',

  jwtAccessSecret:
    process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  orgInvitationSecret:
    process.env.ORG_INVITATION_SECRET || 'dev-org-invitation-secret-change-me',
  orgInvitationExpiresIn: process.env.ORG_INVITATION_EXPIRES_IN || '48h',

  accessCookieName: process.env.ACCESS_COOKIE_NAME || 'accessToken',
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refreshToken',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-me',

  adminEmail: process.env.ADMIN_EMAIL || 'superadmin@stackmind.internal',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    'dev-admin-jwt-secret-change-me',
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
  adminCookieName: process.env.ADMIN_COOKIE_NAME || 'admin_token',
  adminLockoutMaxAttempts: toNumber(process.env.ADMIN_LOCKOUT_MAX_ATTEMPTS, 5),
  adminLockoutWindowMinutes: toNumber(
    process.env.ADMIN_LOCKOUT_WINDOW_MINUTES,
    15
  ),

  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM || 'Stackmind <noreply@stackmind.io>',

  googleClientId: process.env.GOOGLE_CLIENT_ID || 'disabled-google-client-id',
  googleClientSecret:
    process.env.GOOGLE_CLIENT_SECRET || 'disabled-google-client-secret',
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ||
    'http://localhost:4001/api/v1/auth/oauth/google/callback',
  githubClientId: process.env.GITHUB_CLIENT_ID || 'disabled-github-client-id',
  githubClientSecret:
    process.env.GITHUB_CLIENT_SECRET || 'disabled-github-client-secret',
  githubCallbackUrl:
    process.env.GITHUB_CALLBACK_URL ||
    'http://localhost:4001/api/v1/auth/oauth/github/callback',

  oauthSuccessRedirect:
    process.env.OAUTH_SUCCESS_REDIRECT || 'http://localhost:3000/auth/success',
  oauthFailureRedirect:
    process.env.OAUTH_FAILURE_REDIRECT || 'http://localhost:3000/auth/failure',

  aiQueryEnabled: toBoolean(process.env.AI_QUERY_ENABLED, true),
  billingEnabled: toBoolean(process.env.BILLING_ENABLED, true),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID || '',
  stripeProAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
  stripeCustomerPortalReturnUrl:
    process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL ||
    'http://localhost:3000/settings/billing',
  proPriceUsd: toNumber(process.env.PRO_PRICE_USD, 49),
  proAnnualPriceUsd: toNumber(
    process.env.PRO_ANNUAL_PRICE_USD,
    toNumber(process.env.PRO_PRICE_USD, 49) * 10
  ),
  freeMaxUsers: toNumber(process.env.FREE_MAX_USERS, 5),
  freeAiQueryLimit: toNumber(process.env.FREE_AI_QUERY_LIMIT, 100),
  proAiQueryLimit: toNumber(process.env.PRO_AI_QUERY_LIMIT, 5000),
  enterpriseAiQueryLimit: toNumber(process.env.ENTERPRISE_AI_QUERY_LIMIT, 0),
  enterpriseMaxUsers: toNumber(process.env.ENTERPRISE_MAX_USERS, 0),
  openAiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiUseSdk: toBoolean(process.env.GEMINI_USE_SDK, true),
  aiProviderDefault: normalizeProviderDefault(process.env.AI_PROVIDER_DEFAULT),
  aiMockMode: toBoolean(
    process.env.AI_MOCK_MODE,
    !process.env.OPENAI_API_KEY &&
      !process.env.GEMINI_API_KEY &&
      runtimeNodeEnv !== 'production'
  ),
  aiEmbeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
  aiCompletionModel: process.env.AI_COMPLETION_MODEL || 'gpt-4o',
  aiGeminiModel: process.env.AI_GEMINI_MODEL || 'gemini-2.0-flash',
  aiGeminiEmbeddingModel:
    process.env.AI_GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  aiTopK: toNumber(process.env.AI_TOP_K, 10),
  aiVectorCandidates: toNumber(process.env.AI_VECTOR_CANDIDATES, 150),
  aiChunkCollection: process.env.AI_CHUNK_COLLECTION || 'rag_chunks',
  aiVectorIndexName:
    process.env.AI_VECTOR_INDEX_NAME || 'rag_chunks_vector_idx',
  aiVectorEmbeddingPath: process.env.AI_VECTOR_EMBEDDING_PATH || 'embedding',
  aiGraphContextEnabled: toBoolean(process.env.AI_GRAPH_CONTEXT_ENABLED, true),
  aiGraphContextNodes: toNumber(process.env.AI_GRAPH_CONTEXT_NODES, 3),
  aiGraphContextHops: toNumber(process.env.AI_GRAPH_CONTEXT_HOPS, 2),
  aiGraphServiceBaseUrl:
    process.env.GRAPH_SERVICE_BASE_URL ||
    `${process.env.API_BASE_URL || 'http://localhost:4001'}/api/v1/graph`,
  aiGraphServiceTimeoutMs: toNumber(
    process.env.AI_GRAPH_SERVICE_TIMEOUT_MS,
    5000
  ),
  aiRedisEnabled: toBoolean(process.env.AI_REDIS_ENABLED, true),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  aiCacheTtlSeconds: toNumber(process.env.AI_CACHE_TTL_SECONDS, 600),
};
