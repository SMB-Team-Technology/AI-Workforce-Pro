import {
  createOutlookDraft,
  getOutlookMailMessageAsText,
  listOutlookCategories,
  modifyOutlookMessageCategories,
  searchOutlookMailMessages,
  sendOutlookMessage,
} from './outlookMailApi';

describe('searchOutlookMailMessages', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists recent Outlook messages when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            subject: 'Quarterly report',
            from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
            receivedDateTime: '2026-06-01T12:00:00Z',
            bodyPreview: 'Please review the attached report.',
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchOutlookMailMessages('token-123', { pageSize: 10 });

    expect(result.messages).toEqual([
      {
        id: 'msg-1',
        threadId: 'conv-1',
        subject: 'Quarterly report',
        from: 'Alice <alice@example.com>',
        date: '2026-06-01T12:00:00Z',
        snippet: 'Please review the attached report.',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.microsoft.com/v1.0/me/messages'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('filters Outlook messages when a query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [] }),
    } as unknown as Response);

    await searchOutlookMailMessages('token-123', { query: 'invoice' });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('invoice'), expect.any(Object));
  });
});

describe('getOutlookMailMessageAsText', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns plain-text content for an Outlook message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'msg-1',
        subject: 'Hello team',
        from: { emailAddress: { address: 'sender@example.com' } },
        toRecipients: [{ emailAddress: { address: 'team@example.com' } }],
        receivedDateTime: '2026-06-01T12:00:00Z',
        body: { contentType: 'text', content: 'Meeting at 3pm.' },
        bodyPreview: 'Meeting at 3pm.',
      }),
    } as unknown as Response);

    const result = await getOutlookMailMessageAsText('token-123', 'msg-1');

    expect(result.fileName).toBe('Hello team.txt');
    expect(result.content).toContain('Subject: Hello team');
    expect(result.content).toContain('Meeting at 3pm.');
  });
});

describe('createOutlookDraft', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a draft message with recipients and body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'draft-1', conversationId: 'conv-1', webLink: 'https://outlook/1' }),
    } as unknown as Response);

    const result = await createOutlookDraft('token-123', {
      to: ['someone@example.com'],
      subject: 'Hello',
      body: 'Body text',
    });

    expect(result).toEqual({ id: 'draft-1', conversationId: 'conv-1', webLink: 'https://outlook/1' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/messages');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body as string) as {
      toRecipients: Array<{ emailAddress: { address: string } }>;
      body: { content: string };
    };
    expect(payload.toRecipients[0].emailAddress.address).toBe('someone@example.com');
    expect(payload.body.content).toBe('Body text');
  });

  it('uses createReply then patches the draft when replying', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'reply-draft', conversationId: 'conv-9' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'reply-draft', conversationId: 'conv-9' }),
      } as unknown as Response);

    await createOutlookDraft('token-123', {
      to: [],
      body: 'My reply',
      replyToMessageId: 'orig-1',
    });

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/orig-1/createReply',
    );
    const [patchUrl, patchInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toBe('https://graph.microsoft.com/v1.0/me/messages/reply-draft');
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(patchInit.body as string).body.content).toBe('My reply');
  });

  it('throws when a non-reply has no recipient', async () => {
    await expect(createOutlookDraft('token-123', { to: [], body: 'hi' })).rejects.toThrow(
      'At least one recipient is required',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('sendOutlookMessage', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a draft then posts to the send endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'draft-1', conversationId: 'conv-1' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      } as unknown as Response);

    const result = await sendOutlookMessage('token-123', {
      to: ['a@example.com'],
      body: 'Hi',
    });

    expect(result).toEqual({ id: 'draft-1', conversationId: 'conv-1' });
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/me/messages/draft-1/send',
    );
  });
});

describe('listOutlookCategories', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the master categories', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ id: 'cat-1', displayName: 'Clients', color: 'preset0' }],
      }),
    } as unknown as Response);

    const categories = await listOutlookCategories('token-123');
    expect(categories).toEqual([{ id: 'cat-1', displayName: 'Clients', color: 'preset0' }]);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/me/outlook/masterCategories',
    );
  });
});

describe('modifyOutlookMessageCategories', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('merges current categories with additions and removals', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1', categories: ['Existing', 'Drop'] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-1', categories: ['Existing', 'Clients'] }),
      } as unknown as Response);

    const result = await modifyOutlookMessageCategories('token-123', {
      messageId: 'msg-1',
      addCategories: ['Clients'],
      removeCategories: ['Drop'],
    });

    expect(result).toEqual({ id: 'msg-1', categories: ['Existing', 'Clients'] });
    const [patchUrl, patchInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toBe('https://graph.microsoft.com/v1.0/me/messages/msg-1');
    expect(patchInit.method).toBe('PATCH');
    const sent = JSON.parse(patchInit.body as string) as { categories: string[] };
    expect(sent.categories).toContain('Existing');
    expect(sent.categories).toContain('Clients');
    expect(sent.categories).not.toContain('Drop');
  });

  it('throws when no categories are provided', async () => {
    await expect(
      modifyOutlookMessageCategories('token-123', { messageId: 'msg-1' }),
    ).rejects.toThrow('Provide at least one category');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
