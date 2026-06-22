import { inferMimeType } from 'librechat-data-provider';

export interface OneDriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface OneDriveSearchResult {
  files: OneDriveFileSummary[];
  nextPageToken?: string;
}

export interface OneDriveSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const DRIVE_ITEM_SELECT = 'id,name,file,folder,size,lastModifiedDateTime';

export const ONEDRIVE_NOT_PROVISIONED_ERROR = 'OneDrive not provisioned';

type GraphErrorPayload = {
  error?: {
    code?: string;
  };
};

export function isOneDriveNotProvisionedGraphError(status: number, errorBody: string): boolean {
  if (status !== 404) {
    return false;
  }

  try {
    const payload = JSON.parse(errorBody) as GraphErrorPayload;
    return payload.error?.code === 'itemNotFound';
  } catch {
    return errorBody.includes('itemNotFound');
  }
}

type GraphDriveItem = {
  id: string;
  name: string;
  file?: { mimeType?: string };
  folder?: Record<string, never>;
  size?: number;
  lastModifiedDateTime?: string;
};

type GraphDriveItemsResponse = {
  value?: GraphDriveItem[];
  '@odata.nextLink'?: string;
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 50);
}

function escapeGraphSearchQuery(query: string): string {
  return query.replace(/'/g, "''");
}

function resolveOneDriveMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(item: GraphDriveItem): OneDriveFileSummary | null {
  if (item.folder) {
    return null;
  }

  const reportedMimeType = item.file?.mimeType ?? '';
  return {
    id: item.id,
    name: item.name,
    mimeType: resolveOneDriveMimeType(item.name, reportedMimeType),
    modifiedTime: item.lastModifiedDateTime,
    size: item.size != null ? String(item.size) : undefined,
  };
}

function mapDriveItems(items: GraphDriveItem[]): OneDriveFileSummary[] {
  const files: OneDriveFileSummary[] = [];
  for (const item of items) {
    const summary = toFileSummary(item);
    if (summary) {
      files.push(summary);
    }
  }
  return files;
}

async function graphRequest<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (isOneDriveNotProvisionedGraphError(response.status, errorBody)) {
      throw new Error(ONEDRIVE_NOT_PROVISIONED_ERROR);
    }
    throw new Error(`Microsoft Graph API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function buildListUrl(pageSize: number): string {
  const params = new URLSearchParams({
    $top: String(pageSize),
    $select: DRIVE_ITEM_SELECT,
  });
  return `${GRAPH_URL}/me/drive/root/children?${params.toString()}`;
}

function buildSearchUrl(query: string, pageSize: number): string {
  const params = new URLSearchParams({
    $top: String(pageSize),
    $select: DRIVE_ITEM_SELECT,
  });
  return `${GRAPH_URL}/me/drive/root/search(q='${escapeGraphSearchQuery(query)}')?${params.toString()}`;
}

export async function searchMicrosoftOneDriveFiles(
  accessToken: string,
  options: OneDriveSearchOptions = {},
): Promise<OneDriveSearchResult> {
  const pageSize = clampPageSize(options.pageSize);
  const url = options.pageToken
    ? options.pageToken
    : options.query?.trim()
      ? buildSearchUrl(options.query.trim(), pageSize)
      : buildListUrl(pageSize);

  const payload = await graphRequest<GraphDriveItemsResponse>(accessToken, url);

  return {
    files: mapDriveItems(payload.value ?? []),
    nextPageToken: payload['@odata.nextLink'],
  };
}

export async function downloadMicrosoftOneDriveFile(
  accessToken: string,
  file: Pick<OneDriveFileSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(
    `${GRAPH_URL}/me/drive/items/${encodeURIComponent(file.id)}/content`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (isOneDriveNotProvisionedGraphError(response.status, errorBody)) {
      throw new Error(ONEDRIVE_NOT_PROVISIONED_ERROR);
    }
    throw new Error(`Microsoft OneDrive download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveOneDriveMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}
