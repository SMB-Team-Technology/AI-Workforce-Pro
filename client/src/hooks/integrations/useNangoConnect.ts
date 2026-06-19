import { useCallback, useRef, useState } from 'react';
import Nango from '@nangohq/frontend';
import { useQueryClient } from '@tanstack/react-query';
import { useToastContext } from '@librechat/client';
import {
  isIntegrationConnected,
  needsIntegrationReconnect,
  QueryKeys,
} from 'librechat-data-provider';
import type { IntegrationConnectionStatus, IntegrationProviderKey } from 'librechat-data-provider';
import {
  useConfirmIntegrationMutation,
  useGetIntegrationConnectParamsMutation,
  useGetStartupConfig,
  useIntegrationStatusQuery,
} from '~/data-provider';
import { isIntegrationReconnectSuccess } from '~/components/Integrations/connectPrompt';
import { useLocalize } from '~/hooks';

interface UseNangoConnectOptions {
  providerKey?: IntegrationProviderKey;
  enabled?: boolean;
}

export function useNangoConnect({
  providerKey = 'google-drive',
  enabled = true,
}: UseNangoConnectOptions = {}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const integrationsEnabled = startupConfig?.integrationsEnabled === true;
  const nangoHost = startupConfig?.nangoHost;
  const nangoPublicKey = startupConfig?.nangoPublicKey;

  const {
    data: statusData,
    isLoading,
    refetch,
  } = useIntegrationStatusQuery(providerKey, {
    enabled: enabled && integrationsEnabled,
  });

  const connectParamsMutation = useGetIntegrationConnectParamsMutation();
  const confirmMutation = useConfirmIntegrationMutation();
  const [isConnecting, setIsConnecting] = useState(false);
  const connectInFlightRef = useRef(false);

  const status: IntegrationConnectionStatus | undefined = statusData?.integration?.status;
  const isConnected = isIntegrationConnected(status ?? 'not_connected');
  const needsReconnect = needsIntegrationReconnect(status ?? 'not_connected');
  const labelKey = statusData?.integration?.labelKey ?? 'com_integrations_google_drive';

  const syncStatus = useCallback(async () => {
    await queryClient.invalidateQueries([QueryKeys.integrations]);
    await queryClient.invalidateQueries([QueryKeys.integrationStatus, providerKey]);
    await refetch();
  }, [queryClient, providerKey, refetch]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!integrationsEnabled || !nangoHost || !nangoPublicKey) {
      return false;
    }

    if (isConnected) {
      return true;
    }

    if (connectInFlightRef.current) {
      return false;
    }

    connectInFlightRef.current = true;
    setIsConnecting(true);
    const statusBeforeConnect = status;

    try {
      const params = await connectParamsMutation.mutateAsync(providerKey);
      const nango = new Nango({ host: nangoHost, publicKey: nangoPublicKey });
      const authResult = await nango.auth(params.nangoIntegrationId, params.connectionId);

      if (authResult.isPending) {
        showToast({
          message: localize('com_integrations_connect_error'),
          status: 'warning',
        });
        return false;
      }

      await confirmMutation.mutateAsync(providerKey);
      await syncStatus();
      showToast({
        message: localize(
          isIntegrationReconnectSuccess(statusBeforeConnect)
            ? 'com_integrations_reconnect_success'
            : 'com_integrations_connect_success',
        ),
        status: 'success',
      });
      return true;
    } catch {
      showToast({
        message: localize('com_integrations_connect_error'),
        status: 'error',
      });
      return false;
    } finally {
      connectInFlightRef.current = false;
      setIsConnecting(false);
    }
  }, [
    integrationsEnabled,
    nangoHost,
    nangoPublicKey,
    isConnected,
    connectParamsMutation,
    confirmMutation,
    providerKey,
    syncStatus,
    showToast,
    localize,
    status,
  ]);

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (!integrationsEnabled) {
      return false;
    }

    if (isConnected) {
      return true;
    }

    return connect();
  }, [integrationsEnabled, isConnected, connect]);

  return {
    providerKey,
    labelKey,
    status,
    isConnected,
    needsReconnect,
    isConnecting,
    isLoading,
    integrationsEnabled,
    connect,
    ensureConnected,
    refetch: syncStatus,
  };
}
