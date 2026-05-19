import { env } from '../../config/env.js';
import logger from '../../config/loggers.js';
import { normalizeEvent } from '../normalizers/eventNormalizer.js';
import { publishNormalizedEvent } from '../publishers/kafkaPublisher.js';
import { withRetry } from './retry.service.js';

const retryConfig = {
  maxRetries: env.retryMaxRetries,
  baseDelayMs: env.retryBaseDelayMs,
  maxDelayMs: env.retryMaxDelayMs,
};

export const ingestNormalizedEvent = async event => {
  const normalizedEvent =
    event?.org_id && event?.source && event?.event_type
      ? {
          org_id: event.org_id,
          source: event.source,
          event_type: event.event_type,
          content: event.content || {},
          metadata: event.metadata || {},
          timestamp: event.timestamp || new Date().toISOString(),
        }
      : normalizeEvent(event);

  await withRetry(() => publishNormalizedEvent(normalizedEvent), {
    ...retryConfig,
    onRetry: ({ attempt, waitTime, error }) => {
      logger.warn(
        JSON.stringify({
          service: 'ingestion',
          message: 'Retrying ingestion publication',
          attempt,
          waitTime,
          error: error?.message || String(error),
        })
      );
    },
  });

  return normalizedEvent;
};

export const ingestNormalizedEvents = async events => {
  const ingested = [];

  for (const event of events) {
    ingested.push(await ingestNormalizedEvent(event));
  }

  return ingested;
};
