const toIsoTimestamp = value => {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const numericValue = Number(value);
    const milliseconds =
      numericValue < 1e12 ? numericValue * 1000 : numericValue;
    const numericDate = new Date(milliseconds);

    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toISOString();
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
};

export const normalizeEvent = ({
  orgId,
  source,
  eventType,
  content = {},
  metadata = {},
  timestamp = new Date(),
}) => ({
  org_id: orgId,
  source,
  event_type: eventType,
  content,
  metadata,
  timestamp: toIsoTimestamp(timestamp),
});

const buildMetadata = (payload = {}, event = {}) => ({
  ...payload,
  ...event,
});

export const normalizeGitHubWebhookEvent = ({ orgId, req, payload }) => {
  const eventType =
    req.headers['x-github-event'] || payload.action || 'unknown';
  const content = {
    action: payload.action || null,
    repository:
      payload.repository?.full_name || payload.repository?.name || null,
    ref: payload.ref || null,
    commits: Array.isArray(payload.commits)
      ? payload.commits.map(commit => ({
          id: commit.id,
          message: commit.message,
          author: commit.author,
          url: commit.url,
        }))
      : [],
    pull_request: payload.pull_request
      ? {
          number: payload.pull_request.number,
          state: payload.pull_request.state,
          title: payload.pull_request.title,
          merged: payload.pull_request.merged,
          url: payload.pull_request.html_url || payload.pull_request.url,
        }
      : null,
    issue: payload.issue
      ? {
          number: payload.issue.number,
          state: payload.issue.state,
          title: payload.issue.title,
          url: payload.issue.html_url || payload.issue.url,
        }
      : null,
  };

  return normalizeEvent({
    orgId,
    source: 'github',
    eventType,
    content,
    metadata: buildMetadata(
      {
        delivery_id: req.headers['x-github-delivery'] || null,
        installation_id: payload.installation?.id || null,
        sender: payload.sender?.login || null,
      },
      payload.repository
        ? {
            repository_id: payload.repository.id || null,
            repository_full_name: payload.repository.full_name || null,
          }
        : {}
    ),
    timestamp:
      payload.repository?.updated_at ||
      payload.head_commit?.timestamp ||
      new Date(),
  });
};

export const normalizeJiraWebhookEvent = ({ orgId, req, payload }) => {
  const issue = payload.issue || payload.changelog?.issue || {};
  const eventType =
    payload.webhookEvent ||
    issue?.fields?.status?.name ||
    req.headers['x-atlassian-webhook-event'] ||
    'jira.issue.updated';

  return normalizeEvent({
    orgId,
    source: 'jira',
    eventType,
    content: {
      action: payload.webhookEvent || payload.issue_event_type_name || null,
      issue: {
        id: issue.id || null,
        key: issue.key || null,
        summary: issue.fields?.summary || null,
        status: issue.fields?.status?.name || null,
        assignee: issue.fields?.assignee?.displayName || null,
        reporter: issue.fields?.reporter?.displayName || null,
      },
      project: issue.fields?.project
        ? {
            id: issue.fields.project.id || null,
            key: issue.fields.project.key || null,
            name: issue.fields.project.name || null,
          }
        : null,
      changelog: payload.changelog || null,
    },
    metadata: buildMetadata(
      {
        issue_id: issue.id || null,
        issue_key: issue.key || null,
        user: payload.user?.displayName || payload.user?.name || null,
      },
      payload.properties || {}
    ),
    timestamp:
      payload.timestamp || payload.issue?.fields?.updated || new Date(),
  });
};

export const normalizeSlackWebhookEvent = ({ orgId, req, payload }) => {
  const eventType = payload.event?.type || payload.type || 'message';
  const content = {
    channel: payload.event?.channel || payload.channel || null,
    user: payload.event?.user || payload.user || null,
    text: payload.event?.text || payload.text || null,
    thread_ts: payload.event?.thread_ts || payload.thread_ts || null,
    ts: payload.event?.ts || payload.ts || null,
    subtype: payload.event?.subtype || payload.subtype || null,
  };

  return normalizeEvent({
    orgId,
    source: 'slack',
    eventType,
    content,
    metadata: buildMetadata(
      {
        team_id: payload.team_id || null,
        api_app_id: payload.api_app_id || null,
        bot_id: payload.event?.bot_id || payload.bot_id || null,
      },
      {
        request_id: req.headers['x-slack-request-id'] || null,
      }
    ),
    timestamp:
      payload.event?.event_ts ||
      payload.event?.ts ||
      payload.event_time ||
      new Date(),
  });
};

export const normalizeConfluenceActivity = ({ orgId, item, metadata = {} }) =>
  normalizeEvent({
    orgId,
    source: 'confluence',
    eventType: item.eventType || item.type || 'confluence.activity',
    content: item,
    metadata,
    timestamp: item.when || item.lastModified || new Date(),
  });
