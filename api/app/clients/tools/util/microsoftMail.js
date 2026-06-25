const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  createOutlookDraft,
  getOutlookMailMessageAsText,
  listOutlookCategories,
  modifyOutlookMessageCategories,
  searchOutlookMailMessages,
  sendOutlookMessage,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const microsoftMailJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'search',
        'read_message',
        'create_draft',
        'send_message',
        'list_categories',
        'modify_categories',
      ],
      description:
        'Use "search" to find emails (default). "read_message" to read one full email by message_id. "create_draft" to save a draft without sending. "send_message" to send an email immediately. "list_categories" to list available Outlook categories. "modify_categories" to add/remove categories on a message.',
    },
    query: {
      type: 'string',
      description:
        'For search: optional search query for Outlook mail. Leave empty to list recent messages.',
    },
    page_size: {
      type: 'number',
      description: 'For search: maximum number of messages to return (1-20). Defaults to 10.',
    },
    message_id: {
      type: 'string',
      description:
        'For read_message and modify_categories: the Outlook message ID (from search results).',
    },
    to: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: recipient email addresses.',
    },
    cc: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: optional CC email addresses.',
    },
    bcc: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: optional BCC email addresses.',
    },
    subject: {
      type: 'string',
      description: 'For create_draft/send_message: the email subject line.',
    },
    body: {
      type: 'string',
      description: 'For create_draft/send_message: the plain-text email body.',
    },
    reply_to_message_id: {
      type: 'string',
      description:
        'For create_draft/send_message: optional message ID to reply to; keeps the email in the same conversation.',
    },
    add_categories: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For modify_categories: category names to add (use list_categories to see available names).',
    },
    remove_categories: {
      type: 'array',
      items: { type: 'string' },
      description: 'For modify_categories: category names to remove.',
    },
  },
};

function toRecipientList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

function createNangoServiceInstance() {
  return createNangoService({
    getClient: getNangoClient,
    findNangoConnectionByUserAndProvider: db.findNangoConnectionByUserAndProvider,
    listNangoConnectionsByUserId: db.listNangoConnectionsByUserId,
    listNangoConnectionsByTenantId: db.listNangoConnectionsByTenantId,
    upsertNangoConnection: db.upsertNangoConnection,
    deleteNangoConnectionByUserAndProvider: db.deleteNangoConnectionByUserAndProvider,
  });
}

/**
 * @param {{ user: import('@librechat/data-schemas').IUser }} options
 */
async function createMicrosoftMailTool({ user }) {
  return tool(
    async ({
      action = 'search',
      query,
      page_size = 10,
      message_id,
      to,
      cc,
      bcc,
      subject,
      body,
      reply_to_message_id,
      add_categories,
      remove_categories,
    }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Microsoft 365 integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'microsoft');

        if (action === 'read_message') {
          if (!message_id) {
            return JSON.stringify({ error: 'message_id is required to read a message.' });
          }
          const message = await getOutlookMailMessageAsText(token.accessToken, message_id);
          return JSON.stringify({ message });
        }

        if (action === 'create_draft') {
          const draft = await createOutlookDraft(token.accessToken, {
            to: toRecipientList(to),
            cc: toRecipientList(cc),
            bcc: toRecipientList(bcc),
            subject,
            body,
            replyToMessageId: reply_to_message_id,
          });
          return JSON.stringify({ draft, message: 'Outlook draft created successfully.' });
        }

        if (action === 'send_message') {
          const sent = await sendOutlookMessage(token.accessToken, {
            to: toRecipientList(to),
            cc: toRecipientList(cc),
            bcc: toRecipientList(bcc),
            subject,
            body,
            replyToMessageId: reply_to_message_id,
          });
          return JSON.stringify({ sent, message: 'Email sent successfully.' });
        }

        if (action === 'list_categories') {
          const categories = await listOutlookCategories(token.accessToken);
          return JSON.stringify({ categories });
        }

        if (action === 'modify_categories') {
          if (!message_id) {
            return JSON.stringify({ error: 'message_id is required to modify categories.' });
          }
          const result = await modifyOutlookMessageCategories(token.accessToken, {
            messageId: message_id,
            addCategories: add_categories,
            removeCategories: remove_categories,
          });
          return JSON.stringify({ result, message: 'Categories updated successfully.' });
        }

        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const result = await searchOutlookMailMessages(token.accessToken, {
          query,
          pageSize,
        });

        return JSON.stringify({
          messages: result.messages,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Outlook mail request failed';
        logger.error('[microsoft_mail] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.microsoft_mail,
      description:
        'Read and manage the connected user Outlook mailbox: search emails, read a full message, create drafts, send messages, and add or remove categories. The user must connect Microsoft 365 first. Sending email is irreversible — confirm recipients and content with the user before using action send_message.',
      schema: microsoftMailJsonSchema,
    },
  );
}

module.exports = {
  createMicrosoftMailTool,
};
