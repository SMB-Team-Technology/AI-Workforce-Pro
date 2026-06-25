import type { GmailMessageSummary, GmailSearchResult } from '../googleMail/mailApi';

export type { GmailMessageSummary, GmailSearchResult };

export interface OutlookMailSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

type GraphEmailAddress = {
  name?: string;
  address?: string;
};

type GraphOutlookMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: GraphEmailAddress };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  toRecipients?: Array<{ emailAddress?: GraphEmailAddress }>;
  webLink?: string;
  categories?: string[];
};

type GraphOutlookMessagesResponse = {
  value?: GraphOutlookMessage[];
  '@odata.nextLink'?: string;
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 10, 1), 25);
}

function sanitizeFileNameBase(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .slice(0, 80);
}

function formatSender(from?: { emailAddress?: GraphEmailAddress }): string {
  const emailAddress = from?.emailAddress;
  if (!emailAddress) {
    return 'Unknown sender';
  }
  if (emailAddress.name && emailAddress.address) {
    return `${emailAddress.name} <${emailAddress.address}>`;
  }
  return emailAddress.address ?? emailAddress.name ?? 'Unknown sender';
}

function formatRecipients(recipients?: Array<{ emailAddress?: GraphEmailAddress }>): string {
  if (!recipients?.length) {
    return '';
  }
  return recipients
    .map((recipient) => {
      const emailAddress = recipient.emailAddress;
      if (!emailAddress) {
        return '';
      }
      if (emailAddress.name && emailAddress.address) {
        return `${emailAddress.name} <${emailAddress.address}>`;
      }
      return emailAddress.address ?? emailAddress.name ?? '';
    })
    .filter(Boolean)
    .join(', ');
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapOutlookMessage(message: GraphOutlookMessage): GmailMessageSummary {
  return {
    id: message.id,
    threadId: message.conversationId ?? message.id,
    subject: message.subject?.trim() || '(No subject)',
    from: formatSender(message.from),
    date: message.receivedDateTime ?? '',
    snippet: message.bodyPreview ?? '',
  };
}

async function graphRequest<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Microsoft Graph mail API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

async function graphRequestVoid(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Microsoft Graph mail API error (${response.status}): ${errorBody}`);
  }
}

function buildMessagesUrl(options: OutlookMailSearchOptions): string {
  if (options.pageToken) {
    return options.pageToken;
  }

  const pageSize = clampPageSize(options.pageSize);
  const params = new URLSearchParams({
    $top: String(pageSize),
    $orderby: 'receivedDateTime desc',
    $select: 'id,conversationId,subject,from,receivedDateTime,bodyPreview',
  });

  const query = options.query?.trim();
  if (query) {
    const escaped = query.replace(/'/g, "''");
    params.set('$filter', `contains(subject,'${escaped}') or contains(bodyPreview,'${escaped}')`);
  }

  return `${GRAPH_URL}/me/messages?${params.toString()}`;
}

export async function searchOutlookMailMessages(
  accessToken: string,
  options: OutlookMailSearchOptions = {},
): Promise<GmailSearchResult> {
  const payload = await graphRequest<GraphOutlookMessagesResponse>(
    accessToken,
    buildMessagesUrl(options),
  );

  return {
    messages: (payload.value ?? []).map(mapOutlookMessage),
    nextPageToken: payload['@odata.nextLink'],
  };
}

function extractMessageBody(message: GraphOutlookMessage): string {
  const content = message.body?.content ?? '';
  if (!content) {
    return message.bodyPreview ?? '';
  }
  if (message.body?.contentType?.toLowerCase() === 'html') {
    return stripHtml(content);
  }
  return content;
}

export async function getOutlookMailMessageAsText(
  accessToken: string,
  messageId: string,
): Promise<{ fileName: string; content: string }> {
  const params = new URLSearchParams({
    $select: 'id,subject,from,toRecipients,receivedDateTime,body,bodyPreview',
  });
  const message = await graphRequest<GraphOutlookMessage>(
    accessToken,
    `${GRAPH_URL}/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
  );

  const subject = message.subject?.trim() || '(No subject)';
  const from = formatSender(message.from);
  const to = formatRecipients(message.toRecipients);
  const date = message.receivedDateTime ?? '';
  const body = extractMessageBody(message);

  const content = [
    `Subject: ${subject}`,
    `From: ${from}`,
    to ? `To: ${to}` : '',
    date ? `Date: ${date}` : '',
    '',
    body || message.bodyPreview || '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeSubject = sanitizeFileNameBase(subject);
  return {
    fileName: `${safeSubject || message.id}.txt`,
    content,
  };
}

export interface OutlookComposeOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body: string;
  replyToMessageId?: string;
}

export interface OutlookDraftCreated {
  id: string;
  conversationId: string;
  webLink?: string;
}

export interface OutlookMessageSent {
  id: string;
  conversationId: string;
}

export interface OutlookCategory {
  id: string;
  displayName: string;
  color?: string;
}

export interface OutlookCategoryModification {
  messageId: string;
  addCategories?: string[];
  removeCategories?: string[];
}

export interface OutlookCategoryModificationResult {
  id: string;
  categories: string[];
}

type GraphRecipient = { emailAddress: { address: string } };

interface GraphMessagePayload {
  subject: string;
  body: { contentType: 'Text'; content: string };
  toRecipients: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
}

interface GraphReplyUpdatePayload {
  body: { contentType: 'Text'; content: string };
  subject?: string;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
}

function normalizeRecipients(addresses: string[] | undefined): string[] {
  return (addresses ?? []).map((address) => address.trim()).filter(Boolean);
}

function toGraphRecipients(addresses: string[] | undefined): GraphRecipient[] {
  return normalizeRecipients(addresses).map((address) => ({ emailAddress: { address } }));
}

function assertOutlookCompose(options: OutlookComposeOptions): void {
  if (!options.body?.trim()) {
    throw new Error('Email body is required.');
  }
  if (!options.replyToMessageId && !normalizeRecipients(options.to).length) {
    throw new Error('At least one recipient is required in "to".');
  }
}

function buildGraphMessage(options: OutlookComposeOptions): GraphMessagePayload {
  const message: GraphMessagePayload = {
    subject: options.subject ?? '',
    body: { contentType: 'Text', content: options.body ?? '' },
    toRecipients: toGraphRecipients(options.to),
  };

  const cc = toGraphRecipients(options.cc);
  if (cc.length) {
    message.ccRecipients = cc;
  }
  const bcc = toGraphRecipients(options.bcc);
  if (bcc.length) {
    message.bccRecipients = bcc;
  }

  return message;
}

function mapOutlookDraft(message: GraphOutlookMessage): OutlookDraftCreated {
  return {
    id: message.id,
    conversationId: message.conversationId ?? message.id,
    webLink: message.webLink,
  };
}

function buildReplyUpdate(options: OutlookComposeOptions): GraphReplyUpdatePayload {
  const update: GraphReplyUpdatePayload = {
    body: { contentType: 'Text', content: options.body ?? '' },
  };

  if (options.subject) {
    update.subject = options.subject;
  }
  const to = toGraphRecipients(options.to);
  if (to.length) {
    update.toRecipients = to;
  }
  const cc = toGraphRecipients(options.cc);
  if (cc.length) {
    update.ccRecipients = cc;
  }
  const bcc = toGraphRecipients(options.bcc);
  if (bcc.length) {
    update.bccRecipients = bcc;
  }

  return update;
}

export async function createOutlookDraft(
  accessToken: string,
  options: OutlookComposeOptions,
): Promise<OutlookDraftCreated> {
  assertOutlookCompose(options);

  if (options.replyToMessageId) {
    const draft = await graphRequest<GraphOutlookMessage>(
      accessToken,
      `${GRAPH_URL}/me/messages/${encodeURIComponent(options.replyToMessageId)}/createReply`,
      { method: 'POST' },
    );

    const patched = await graphRequest<GraphOutlookMessage>(
      accessToken,
      `${GRAPH_URL}/me/messages/${encodeURIComponent(draft.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReplyUpdate(options)),
      },
    );

    return mapOutlookDraft(patched);
  }

  const created = await graphRequest<GraphOutlookMessage>(accessToken, `${GRAPH_URL}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGraphMessage(options)),
  });

  return mapOutlookDraft(created);
}

export async function sendOutlookMessage(
  accessToken: string,
  options: OutlookComposeOptions,
): Promise<OutlookMessageSent> {
  const draft = await createOutlookDraft(accessToken, options);

  await graphRequestVoid(
    accessToken,
    `${GRAPH_URL}/me/messages/${encodeURIComponent(draft.id)}/send`,
    { method: 'POST' },
  );

  return { id: draft.id, conversationId: draft.conversationId };
}

export async function listOutlookCategories(accessToken: string): Promise<OutlookCategory[]> {
  const payload = await graphRequest<{
    value?: Array<{ id: string; displayName: string; color?: string }>;
  }>(accessToken, `${GRAPH_URL}/me/outlook/masterCategories`);

  return (payload.value ?? []).map((category) => ({
    id: category.id,
    displayName: category.displayName,
    color: category.color,
  }));
}

export async function modifyOutlookMessageCategories(
  accessToken: string,
  modification: OutlookCategoryModification,
): Promise<OutlookCategoryModificationResult> {
  const addCategories = (modification.addCategories ?? []).map((name) => name.trim()).filter(Boolean);
  const removeCategories = (modification.removeCategories ?? [])
    .map((name) => name.trim())
    .filter(Boolean);

  if (!addCategories.length && !removeCategories.length) {
    throw new Error('Provide at least one category to add or remove.');
  }

  const params = new URLSearchParams({ $select: 'id,categories' });
  const current = await graphRequest<GraphOutlookMessage>(
    accessToken,
    `${GRAPH_URL}/me/messages/${encodeURIComponent(modification.messageId)}?${params.toString()}`,
  );

  const categories = new Set(current.categories ?? []);
  addCategories.forEach((name) => categories.add(name));
  removeCategories.forEach((name) => categories.delete(name));

  const updated = await graphRequest<GraphOutlookMessage>(
    accessToken,
    `${GRAPH_URL}/me/messages/${encodeURIComponent(modification.messageId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: [...categories] }),
    },
  );

  return {
    id: updated.id,
    categories: updated.categories ?? [],
  };
}
