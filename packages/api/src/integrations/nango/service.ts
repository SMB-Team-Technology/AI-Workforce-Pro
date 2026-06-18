import type { INangoConnection, IUser } from '@librechat/data-schemas';
import type { Nango } from '@nangohq/node';
import {
  getIntegrationProvider,
  listAllIntegrationProviders,
  listEnabledIntegrationProviders,
  type IntegrationConnectionStatus,
  type IntegrationProviderKey,
  type IntegrationProviderStatus,
} from '../providers';
import {
  isNangoNotFoundError,
  isNangoSyncSkippableError,
  INTEGRATION_CONFIRM_NOT_FOUND,
} from './errors';

export interface NangoConnectParamsResult {
  nangoIntegrationId: string;
  connectionId: string;
}

export interface NangoConfirmConnectionResult {
  providerKey: IntegrationProviderKey;
  status: IntegrationConnectionStatus;
  connectionId: string;
}

export interface IntegrationAccessTokenResult {
  accessToken: string;
  expiresAt?: string;
  tokenType: string;
}

export interface NangoServiceDeps {
  getClient: () => Nango;
  findNangoConnectionByUserAndProvider: (
    userId: string,
    providerKey: string,
  ) => Promise<INangoConnection | null>;
  listNangoConnectionsByUserId: (userId: string) => Promise<INangoConnection[]>;
  listNangoConnectionsByTenantId: (
    tenantId: string,
    options?: { providerKey?: string; limit?: number; offset?: number },
  ) => Promise<INangoConnection[]>;
  upsertNangoConnection: (input: {
    userId: string;
    tenantId?: string;
    providerKey: string;
    nangoIntegrationId: string;
    connectionId: string;
    status?: INangoConnection['status'];
  }) => Promise<INangoConnection | null>;
  deleteNangoConnectionByUserAndProvider: (userId: string, providerKey: string) => Promise<boolean>;
}

function getUserId(user: IUser): string {
  return user._id?.toString() ?? user.id ?? '';
}

function mapConnectionStatus(
  providerEnabled: boolean,
  connection: INangoConnection | null | undefined,
): IntegrationConnectionStatus {
  if (!providerEnabled) {
    return 'disabled';
  }
  if (!connection) {
    return 'not_connected';
  }
  if (connection.status === 'expired') {
    return 'expired';
  }
  if (connection.status === 'revoked') {
    return 'revoked';
  }
  return 'connected';
}

function toProviderStatus(
  connection: INangoConnection | null | undefined,
): IntegrationProviderStatus {
  const provider =
    getIntegrationProvider(connection?.providerKey ?? '') ?? listAllIntegrationProviders()[0];
  const config = connection ? getIntegrationProvider(connection.providerKey) : provider;
  if (!config) {
    throw new Error('Invalid provider configuration');
  }

  const status = mapConnectionStatus(config.enabled, connection);

  return {
    providerKey: config.key,
    nangoIntegrationId: config.nangoIntegrationId,
    labelKey: config.labelKey,
    icon: config.icon,
    enabled: config.enabled,
    status,
    connectionId: connection?.connectionId,
    connectedAt: connection?.connectedAt?.toISOString(),
    updatedAt: connection?.updatedAt?.toISOString(),
  };
}

export function createNangoService(deps: NangoServiceDeps) {
  const {
    getClient,
    findNangoConnectionByUserAndProvider,
    listNangoConnectionsByUserId,
    listNangoConnectionsByTenantId,
    upsertNangoConnection,
    deleteNangoConnectionByUserAndProvider,
  } = deps;

  async function syncUserConnectionsFromNango(userId: string, tenantId?: string): Promise<void> {
    const nango = getClient();

    let remoteConnections: Array<{ provider_config_key?: string; connection_id?: string }> = [];
    try {
      const payload = await nango.listConnections(userId);
      remoteConnections = payload.connections ?? [];
    } catch (error) {
      if (isNangoSyncSkippableError(error)) {
        return;
      }
      throw error;
    }

    for (const entry of remoteConnections) {
      const integrationId = entry.provider_config_key;
      const connectionId = entry.connection_id;
      if (!integrationId || !connectionId) {
        continue;
      }

      const provider = listEnabledIntegrationProviders().find(
        (candidate) => candidate.nangoIntegrationId === integrationId,
      );
      if (!provider) {
        continue;
      }

      await upsertNangoConnection({
        userId,
        tenantId,
        providerKey: provider.key,
        nangoIntegrationId: provider.nangoIntegrationId,
        connectionId,
        status: 'connected',
      });
    }
  }

  async function listUserProviderStatuses(
    user: IUser,
    options?: { syncFromNango?: boolean },
  ): Promise<IntegrationProviderStatus[]> {
    const userId = getUserId(user);
    if (!userId) {
      return [];
    }

    if (options?.syncFromNango) {
      await syncUserConnectionsFromNango(userId, user.tenantId?.trim() || undefined);
    }

    const stored = await listNangoConnectionsByUserId(userId);
    const storedByProvider = new Map(stored.map((row) => [row.providerKey, row]));

    return listAllIntegrationProviders().map((provider) => {
      const connection = storedByProvider.get(provider.key);
      return {
        providerKey: provider.key,
        nangoIntegrationId: provider.nangoIntegrationId,
        labelKey: provider.labelKey,
        icon: provider.icon,
        enabled: provider.enabled,
        status: mapConnectionStatus(provider.enabled, connection),
        connectionId: connection?.connectionId,
        connectedAt: connection?.connectedAt?.toISOString(),
        updatedAt: connection?.updatedAt?.toISOString(),
      };
    });
  }

  async function getProviderStatus(
    user: IUser,
    providerKey: IntegrationProviderKey,
    options?: { syncFromNango?: boolean },
  ): Promise<IntegrationProviderStatus | null> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider) {
      return null;
    }

    const userId = getUserId(user);
    if (!userId) {
      return null;
    }

    if (options?.syncFromNango) {
      await syncUserConnectionsFromNango(userId, user.tenantId?.trim() || undefined);
    }

    const connection = await findNangoConnectionByUserAndProvider(userId, providerKey);
    return {
      providerKey: provider.key,
      nangoIntegrationId: provider.nangoIntegrationId,
      labelKey: provider.labelKey,
      icon: provider.icon,
      enabled: provider.enabled,
      status: mapConnectionStatus(provider.enabled, connection),
      connectionId: connection?.connectionId,
      connectedAt: connection?.connectedAt?.toISOString(),
      updatedAt: connection?.updatedAt?.toISOString(),
    };
  }

  async function getConnectParams(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<NangoConnectParamsResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not enabled');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    return {
      nangoIntegrationId: provider.nangoIntegrationId,
      connectionId: userId,
    };
  }

  async function confirmProviderConnection(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<NangoConfirmConnectionResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not enabled');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const nango = getClient();
    try {
      await nango.getConnection(provider.nangoIntegrationId, userId);
    } catch (error) {
      if (isNangoNotFoundError(error)) {
        throw new Error(INTEGRATION_CONFIRM_NOT_FOUND);
      }
      throw error;
    }

    await upsertNangoConnection({
      userId,
      tenantId: user.tenantId?.trim() || undefined,
      providerKey: provider.key,
      nangoIntegrationId: provider.nangoIntegrationId,
      connectionId: userId,
      status: 'connected',
    });

    return {
      providerKey: provider.key,
      status: 'connected',
      connectionId: userId,
    };
  }

  async function disconnectProvider(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<void> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider) {
      throw new Error('Unknown integration provider');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const existing = await findNangoConnectionByUserAndProvider(userId, providerKey);
    if (existing?.connectionId) {
      const nango = getClient();
      await nango.deleteConnection(provider.nangoIntegrationId, existing.connectionId);
    }

    await deleteNangoConnectionByUserAndProvider(userId, providerKey);
  }

  async function listTenantConnections(tenantId: string): Promise<INangoConnection[]> {
    return listNangoConnectionsByTenantId(tenantId);
  }

  async function getProviderAccessToken(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<IntegrationAccessTokenResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not available');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const connection = await findNangoConnectionByUserAndProvider(userId, providerKey);
    if (!connection?.connectionId) {
      throw new Error('Integration is not connected');
    }

    const nango = getClient();
    const nangoConnection = await nango.getConnection(
      provider.nangoIntegrationId,
      connection.connectionId,
    );

    const credentials = nangoConnection.credentials as
      | {
          access_token?: string;
          expires_at?: string | Date;
          raw?: { token_type?: string };
        }
      | undefined;
    const accessToken =
      typeof credentials?.access_token === 'string' ? credentials.access_token : undefined;

    if (!accessToken || accessToken.length === 0) {
      throw new Error('Failed to resolve integration access token');
    }

    const rawTokenType = credentials?.raw?.token_type;
    const tokenType =
      typeof rawTokenType === 'string' && rawTokenType.length > 0 ? rawTokenType : 'Bearer';

    const rawExpiresAt = credentials?.expires_at;
    const expiresAt =
      rawExpiresAt instanceof Date
        ? rawExpiresAt.toISOString()
        : typeof rawExpiresAt === 'string'
          ? rawExpiresAt
          : undefined;

    return {
      accessToken,
      expiresAt,
      tokenType,
    };
  }

  return {
    listUserProviderStatuses,
    getProviderStatus,
    getConnectParams,
    confirmProviderConnection,
    disconnectProvider,
    listTenantConnections,
    syncUserConnectionsFromNango,
    upsertNangoConnection,
    getProviderAccessToken,
  };
}

export type NangoService = ReturnType<typeof createNangoService>;
