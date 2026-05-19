import { GoogleGenerativeAI } from '@google/generative-ai';

import { env } from '../../config/env.js';
import { AppError } from '../../utils/appError.js';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

let geminiClient = null;

const EMBEDDING_MODEL_FALLBACKS = [
  'gemini-embedding-001',
  'text-embedding-004',
  'embedding-001',
];

const COMPLETION_MODEL_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
];

const parseGeminiError = async response => {
  try {
    const payload = await response.json();
    return (
      payload?.error?.message ||
      payload?.message ||
      `Gemini request failed with status ${response.status}`
    );
  } catch {
    return `Gemini request failed with status ${response.status}`;
  }
};

const parseGeminiAnswerText = payload => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map(part => String(part?.text || ''))
    .join('')
    .trim();
};

const ensureGeminiApiKey = () => {
  if (!env.geminiApiKey) {
    throw new AppError('GEMINI_API_KEY is not configured', 500);
  }
};

const shouldUseSdk = () => env.geminiUseSdk && env.nodeEnv !== 'test';

const getGeminiClient = () => {
  if (geminiClient) {
    return geminiClient;
  }

  ensureGeminiApiKey();
  geminiClient = new GoogleGenerativeAI(env.geminiApiKey);
  return geminiClient;
};

const buildGeminiUrl = path =>
  `${GEMINI_API_BASE_URL}${path}?key=${encodeURIComponent(env.geminiApiKey)}`;

const normalizeModelName = modelName =>
  String(modelName || '')
    .trim()
    .replace(/^models\//i, '');

const buildEmbeddingModelCandidates = () => {
  const configured = normalizeModelName(env.aiGeminiEmbeddingModel);
  const candidates = [configured, ...EMBEDDING_MODEL_FALLBACKS]
    .map(normalizeModelName)
    .filter(Boolean);

  return [...new Set(candidates)];
};

const buildCompletionModelCandidates = () => {
  const configured = normalizeModelName(env.aiGeminiModel);
  const candidates = [configured, ...COMPLETION_MODEL_FALLBACKS]
    .map(normalizeModelName)
    .filter(Boolean);

  return [...new Set(candidates)];
};

const isModelUnsupportedError = ({ status, message }) => {
  if (status === 404) {
    return true;
  }

  if (status === 400) {
    return /not found|not supported|unsupported|unknown model|does not support/i.test(
      String(message || '')
    );
  }

  if (status !== undefined) {
    return false;
  }

  return /not found|not supported|unsupported|unknown model|does not support/i.test(
    String(message || '')
  );
};

const isQuotaExceededError = ({ status, message }) => {
  if (status === 429) {
    return true;
  }

  return /quota exceeded|rate limit|resource_exhausted|limit:\s*0/i.test(
    String(message || '')
  );
};

const createGeminiQuotaExceededError = ({ operation, model, reason }) =>
  new AppError(
    'Gemini API quota exceeded. This is separate from your Stackmind monthly AI query allowance.',
    429,
    {
      provider: 'gemini',
      operation,
      model,
      reason,
      documentation: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    }
  );

const parseGeminiSdkError = error => {
  const message = String(
    error?.message ||
      error?.error?.message ||
      error?.response?.data?.error?.message ||
      ''
  ).trim();
  const statusFromMessage = Number.parseInt(
    String(message).match(/\[(\d{3})\]/)?.[1],
    10
  );
  const statusCandidates = [
    error?.status,
    error?.response?.status,
    error?.error?.code,
    error?.cause?.status,
    Number.isNaN(statusFromMessage) ? undefined : statusFromMessage,
  ].filter(value => Number.isFinite(value));

  return {
    status: statusCandidates.length > 0 ? statusCandidates[0] : undefined,
    message: message || 'Gemini request failed',
  };
};

const listModelsByMethod = async method => {
  const response = await fetch(buildGeminiUrl('/models'));

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];

  return models
    .filter(model =>
      Array.isArray(model?.supportedGenerationMethods)
        ? model.supportedGenerationMethods.includes(method)
        : false
    )
    .map(model => normalizeModelName(model?.name))
    .filter(Boolean);
};

const listEmbedContentModels = () => listModelsByMethod('embedContent');
const listGenerateContentModels = () => listModelsByMethod('generateContent');

const requestGeminiEmbeddingViaRest = async ({ question, model }) => {
  const response = await fetch(
    buildGeminiUrl(`/models/${encodeURIComponent(model)}:embedContent`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{ text: question }],
        },
      }),
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      model,
      status: response.status,
      message: await parseGeminiError(response),
    };
  }

  const payload = await response.json();
  const embedding = payload?.embedding?.values;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new AppError(
      'Gemini embedding generation returned empty values',
      502,
      {
        model,
      }
    );
  }

  return {
    ok: true,
    model,
    embedding,
  };
};

const requestGeminiCompletionViaRest = async ({
  model,
  systemPrompt,
  userPrompt,
}) => {
  const response = await fetch(
    buildGeminiUrl(`/models/${encodeURIComponent(model)}:generateContent`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      model,
      status: response.status,
      message: await parseGeminiError(response),
    };
  }

  const payload = await response.json();
  const answer = parseGeminiAnswerText(payload);

  if (!answer) {
    throw new AppError('Gemini returned an empty answer', 502, {
      model,
    });
  }

  return {
    ok: true,
    model,
    answer,
  };
};

const requestGeminiEmbeddingViaSdk = async ({ question, model }) => {
  try {
    const client = getGeminiClient();
    const embeddingModel = client.getGenerativeModel({ model });
    const response = await embeddingModel.embedContent(question);
    const embedding = response?.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new AppError(
        'Gemini embedding generation returned empty values',
        502,
        {
          model,
        }
      );
    }

    return {
      ok: true,
      model,
      embedding,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const { status, message } = parseGeminiSdkError(error);
    return {
      ok: false,
      model,
      status,
      message,
    };
  }
};

const requestGeminiCompletionViaSdk = async ({
  model,
  systemPrompt,
  userPrompt,
}) => {
  try {
    const client = getGeminiClient();
    const completionModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.2,
      },
    });
    const result = await completionModel.generateContent(userPrompt);
    const response = result?.response || result;
    const answer =
      typeof response?.text === 'function'
        ? response.text()
        : parseGeminiAnswerText(response);

    if (!answer) {
      throw new AppError('Gemini returned an empty answer', 502, {
        model,
      });
    }

    return {
      ok: true,
      model,
      answer: String(answer).trim(),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const { status, message } = parseGeminiSdkError(error);
    return {
      ok: false,
      model,
      status,
      message,
    };
  }
};

const requestGeminiEmbedding = async args =>
  shouldUseSdk()
    ? requestGeminiEmbeddingViaSdk(args)
    : requestGeminiEmbeddingViaRest(args);

const requestGeminiCompletion = async args =>
  shouldUseSdk()
    ? requestGeminiCompletionViaSdk(args)
    : requestGeminiCompletionViaRest(args);

export const isGeminiConfigured = () => Boolean(env.geminiApiKey);

export const createGeminiEmbedding = async question => {
  ensureGeminiApiKey();
  const candidates = buildEmbeddingModelCandidates();
  const failures = [];

  for (const model of candidates) {
    const result = await requestGeminiEmbedding({ question, model });

    if (result.ok) {
      return result.embedding;
    }

    failures.push({
      model,
      status: result.status,
      reason: result.message,
    });

    if (
      !isModelUnsupportedError({
        status: result.status,
        message: result.message,
      })
    ) {
      if (
        isQuotaExceededError({ status: result.status, message: result.message })
      ) {
        throw createGeminiQuotaExceededError({
          operation: 'embedContent',
          model,
          reason: result.message,
        });
      }

      throw new AppError('Gemini embedding generation failed', 502, {
        model,
        reason: result.message,
      });
    }
  }

  let availableEmbedModels = [];
  try {
    availableEmbedModels = await listEmbedContentModels();
  } catch {
    // Best-effort diagnostics only.
  }

  const lastFailure = failures[failures.length - 1];
  throw new AppError('Gemini embedding generation failed', 502, {
    reason: lastFailure?.reason || 'No embedding model succeeded',
    attempted_models: candidates,
    available_embed_models: availableEmbedModels,
  });
};

export const generateGeminiAnswer = async ({ systemPrompt, userPrompt }) => {
  ensureGeminiApiKey();
  const attemptedModels = [];
  let lastFailure = null;

  const tryModels = async candidates => {
    for (const model of candidates) {
      if (attemptedModels.includes(model)) {
        continue;
      }

      attemptedModels.push(model);
      const result = await requestGeminiCompletion({
        model,
        systemPrompt,
        userPrompt,
      });

      if (result.ok) {
        return result.answer;
      }

      lastFailure = result;
      if (
        !isModelUnsupportedError({
          status: result.status,
          message: result.message,
        })
      ) {
        if (
          isQuotaExceededError({
            status: result.status,
            message: result.message,
          })
        ) {
          throw createGeminiQuotaExceededError({
            operation: 'generateContent',
            model,
            reason: result.message,
          });
        }

        throw new AppError('Gemini completion failed', 502, {
          model,
          reason: result.message,
        });
      }
    }

    return null;
  };

  const initialAnswer = await tryModels(buildCompletionModelCandidates());
  if (initialAnswer) {
    return initialAnswer;
  }

  let availableGenerateModels = [];
  try {
    availableGenerateModels = await listGenerateContentModels();
  } catch {
    // Best-effort diagnostics only.
  }

  const discoveredAnswer = await tryModels(availableGenerateModels);
  if (discoveredAnswer) {
    return discoveredAnswer;
  }

  throw new AppError('Gemini completion failed', 502, {
    reason: lastFailure?.message || 'No generateContent model succeeded',
    attempted_models: attemptedModels,
    available_generate_models: availableGenerateModels,
  });
};
