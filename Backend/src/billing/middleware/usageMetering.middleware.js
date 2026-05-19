import { AppError } from '../../utils/appError.js';
import { env } from '../../config/env.js';
import {
  getOrgAiQueryLimit,
  getOrCreateUsageRecord,
  incrementUsageRecord,
  loadSubscriptionForOrg,
} from '../services/usage.service.js';

const resolveOrgId = req =>
  req.body?.org_id || req.params?.org_id || req.query?.org_id || null;

export const usageMetering =
  ({ units = 1 } = {}) =>
  async (req, _res, next) => {
    if (!env.billingEnabled) {
      return next();
    }

    const orgId = resolveOrgId(req);

    if (!orgId) {
      return next(new AppError('org_id is required for usage metering', 400));
    }

    try {
      const subscription = await loadSubscriptionForOrg(orgId);
      const limit = getOrgAiQueryLimit(subscription);
      const record = await getOrCreateUsageRecord(orgId);

      if (limit !== 0 && record.usageCount + units > limit) {
        return next(
          new AppError('Monthly AI query limit exceeded', 429, {
            org_id: orgId,
            usageCount: record.usageCount,
            limit,
            periodKey: record.periodKey,
          })
        );
      }

      const updated = await incrementUsageRecord({ orgId, units });
      req.billingSubscription = subscription;
      req.billingUsage = updated;
      return next();
    } catch (error) {
      return next(error);
    }
  };
