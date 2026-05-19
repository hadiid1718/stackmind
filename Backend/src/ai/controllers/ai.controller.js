import { AppError } from '../../utils/appError.js';
import { env } from '../../config/env.js';
import {
  assertOrgMembership,
  getCachedRagResponse,
  streamRagAnswer,
} from '../services/ragQuery.service.js';
import { recordAiQuery } from '../services/queryAudit.service.js';

const writeSseEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const initializeSseResponse = res => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

export const streamRagQuery = async (req, res, next) => {
  const {
    org_id: orgId,
    question,
    ai_provider: aiProvider = 'auto',
  } = req.body;
  const startedAt = Date.now();
  const inferredProviderForErrors =
    aiProvider === 'openai' || aiProvider === 'gemini'
      ? aiProvider
      : env.aiProviderDefault === 'gemini' && env.geminiApiKey
        ? 'gemini'
        : env.openAiApiKey
          ? 'openai'
          : env.geminiApiKey
            ? 'gemini'
            : 'mock';

  try {
    if (!env.aiQueryEnabled) {
      next(new AppError('AI query module is disabled', 503));
      return;
    }

    if (!req.auth?.sub) {
      next(new AppError('Authentication required', 401));
      return;
    }

    await assertOrgMembership({
      userId: req.auth.sub,
      orgId,
    });

    initializeSseResponse(res);

    const cached = await getCachedRagResponse({
      orgId,
      question,
      aiProvider,
    });

    const ignoreCachedMock =
      cached && cached.ai_provider === 'mock' && !env.aiMockMode;

    if (cached && !ignoreCachedMock) {
      const cachedProvider = cached.ai_provider || 'mock';

      writeSseEvent(res, 'meta', {
        cached: true,
        citations: cached.citations,
        graph_context: cached.graph_context,
        chunks_used: cached.chunks_used || null,
        ai_provider_requested: aiProvider,
        ai_provider: cachedProvider,
        retrieval_mode: cached.retrieval_mode || 'cache',
      });
      writeSseEvent(res, 'token', { text: cached.answer });
      writeSseEvent(res, 'done', {
        answer: cached.answer,
        ai_provider_requested: aiProvider,
        ai_provider: cachedProvider,
      });

      await recordAiQuery({
        orgId,
        userId: req.auth?.sub || null,
        question,
        answer: cached.answer,
        status: 'success',
        aiProviderRequested: aiProvider,
        aiProvider: cachedProvider,
        cached: true,
        chunksUsed: cached.chunks_used || 0,
        citationsCount: Array.isArray(cached.citations)
          ? cached.citations.length
          : 0,
        graphContextCount: Array.isArray(cached.graph_context)
          ? cached.graph_context.length
          : 0,
        latencyMs: Date.now() - startedAt,
        metadata: {
          retrieval_mode: cached.retrieval_mode || 'cache',
        },
      });

      res.end();
      return;
    }

    let tokenEvents = 0;

    const result = await streamRagAnswer({
      orgId,
      question,
      aiProvider,
      onMeta: meta => {
        if (!res.writableEnded) {
          writeSseEvent(res, 'meta', meta);
        }
      },
      onToken: token => {
        if (res.writableEnded) {
          return;
        }

        tokenEvents += 1;
        writeSseEvent(res, 'token', { text: token });
      },
    });

    writeSseEvent(res, 'done', {
      answer: result.answer,
      token_events: tokenEvents,
      latency_ms: Date.now() - startedAt,
      ai_provider_requested: result.ai_provider_requested || aiProvider,
      ai_provider: result.ai_provider || 'mock',
    });

    await recordAiQuery({
      orgId,
      userId: req.auth?.sub || null,
      question,
      answer: result.answer,
      status: 'success',
      aiProviderRequested: result.ai_provider_requested || aiProvider,
      aiProvider: result.ai_provider || 'mock',
      cached: Boolean(result.cached),
      chunksUsed: result.chunks_used || 0,
      citationsCount: Array.isArray(result.citations)
        ? result.citations.length
        : 0,
      graphContextCount: Array.isArray(result.graph_context)
        ? result.graph_context.length
        : 0,
      latencyMs: Date.now() - startedAt,
      metadata: {
        token_events: tokenEvents,
        retrieval_mode: result.retrieval_mode || 'vector',
      },
    });

    res.end();
  } catch (error) {
    await recordAiQuery({
      orgId,
      userId: req.auth?.sub || null,
      question,
      status: error?.name === 'AbortError' ? 'stopped' : 'error',
      aiProviderRequested: aiProvider,
      aiProvider: inferredProviderForErrors,
      cached: false,
      chunksUsed: 0,
      citationsCount: 0,
      graphContextCount: 0,
      latencyMs: Date.now() - startedAt,
      errorMessage: error?.message || 'Unexpected AI query error',
    });

    if (!res.headersSent) {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      res.status(statusCode).json({
        message:
          error instanceof AppError
            ? error.message
            : error?.message || 'AI query failed',
        details:
          error instanceof AppError
            ? error.details
            : { reason: error?.message || 'Unexpected error' },
      });
      return;
    }

    writeSseEvent(res, 'error', {
      message: error?.message || 'Unexpected streaming error',
      details: error?.details,
    });

    res.end();
  }
};
