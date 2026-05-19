import { env } from '../../config/env.js';
import logger from '../../config/loggers.js';
import { publishToKafka } from '../../ingestion/config/kafka.js';
import { createNotificationRecord } from './notification.service.js';
import { emitNotificationRealtime } from './notificationRealtime.service.js';

export const publishNotificationEvent = async event => {
  if (!env.notificationsEnabled) {
    return {
      skipped: true,
      reason: 'notifications-disabled',
      notification: null,
    };
  }

  const createResult = await createNotificationRecord(event);

  if (!createResult.skipped && createResult.notification) {
    emitNotificationRealtime(createResult.notification);
  }

  const kafkaPayload = createResult.notification
    ? {
        notification_id: createResult.notification.id,
        ...createResult.notification,
      }
    : {
        user_id: event.user_id,
        org_id: event.org_id || 'global',
        type: event.type,
        severity: event.severity,
        message: event.message,
        route: event.route,
        metadata: event.metadata || {},
        skipped: true,
        reason: createResult.reason || 'notification-skipped',
        createdAt: new Date().toISOString(),
      };

  await publishToKafka(env.notificationKafkaTopic, {
    ...kafkaPayload,
  });

  return {
    skipped: Boolean(createResult.skipped),
    reason: createResult.reason,
    notification: createResult.notification,
  };
};

export const emitNotificationSafely = async event => {
  try {
    return await publishNotificationEvent(event);
  } catch (error) {
    logger.warn(
      JSON.stringify({
        service: 'notifications',
        message: 'Notification publish failed',
        error: error?.message || String(error),
        event,
      })
    );

    return { skipped: true, failed: true };
  }
};
