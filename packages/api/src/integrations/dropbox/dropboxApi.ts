import { inferMimeType } from 'librechat-data-provider';

export interface DropboxFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface DropboxSearchResult {
  files: DropboxFileSummary[];
  nextPageToken?: string;
}

export interface DropboxSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_URL = 'https://content.dropboxapi.com/2';

type DropboxFileMetadata = {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  client_modified?: string;
  size?: number;
};

function resolveDropboxMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(metadata: DropboxFileMetadata): DropboxFileSummary {
  return {
    id: metadata.id,
    name: metadata.name,
    mimeType: resolveDropboxMimeType(metadata.name),
    modifiedTime: metadata.client_modified,
    size: metadata.size != null ? String(metadata.size) : undefined,
  };
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 50);
}

async function dropboxApiRequest<T>(
  accessToken: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${DROPBOX_API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dropbox API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function mapFileEntries(entries: DropboxFileMetadata[]): DropboxFileSummary[] {
  const files: DropboxFileSummary[] = [];
  for (const entry of entries) {
    if (entry['.tag'] === 'file') {
      files.push(toFileSummary(entry));
    }
  }
  return files;
}

async function searchDropboxWithQuery(
  accessToken: string,
  options: DropboxSearchOptions,
): Promise<DropboxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const endpoint = options.pageToken ? 'files/search/continue_v2' : 'files/search_v2';
  const body = options.pageToken
    ? { cursor: options.pageToken }
    : {
        query: options.query?.trim() ?? '',
        options: {
          path: '',
          max_results: pageSize,
        },
      };

  const payload = await dropboxApiRequest<{
    matches?: Array<{ metadata: DropboxFileMetadata }>;
    has_more?: boolean;
    cursor?: string;
  }>(accessToken, endpoint, body);

  const files: DropboxFileSummary[] = [];
  for (const match of payload.matches ?? []) {
    if (match.metadata['.tag'] === 'file') {
      files.push(toFileSummary(match.metadata));
    }
  }

  return {
    files,
    nextPageToken: payload.has_more ? payload.cursor : undefined,
  };
}

async function listDropboxFolder(
  accessToken: string,
  options: DropboxSearchOptions,
): Promise<DropboxSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const endpoint = options.pageToken ? 'files/list_folder/continue' : 'files/list_folder';
  const body = options.pageToken
    ? { cursor: options.pageToken }
    : {
        path: '',
        recursive: false,
        include_deleted: false,
        limit: pageSize,
      };

  const payload = await dropboxApiRequest<{
    entries?: DropboxFileMetadata[];
    has_more?: boolean;
    cursor?: string;
  }>(accessToken, endpoint, body);

  return {
    files: mapFileEntries(payload.entries ?? []),
    nextPageToken: payload.has_more ? payload.cursor : undefined,
  };
}

export async function searchDropboxFiles(
  accessToken: string,
  options: DropboxSearchOptions = {},
): Promise<DropboxSearchResult> {
  const query = options.query?.trim();
  if (query) {
    return searchDropboxWithQuery(accessToken, options);
  }
  return listDropboxFolder(accessToken, options);
}

export async function downloadDropboxFile(
  accessToken: string,
  file: Pick<DropboxFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(`${DROPBOX_CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: file.id }),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dropbox download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveDropboxMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}
