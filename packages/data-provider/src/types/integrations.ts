export type IntegrationConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'expired'
  | 'revoked'
  | 'disabled';

export type IntegrationProviderKey =
  | 'google-drive'
  | 'google-mail'
  | 'google-calendar'
  | 'microsoft'
  | 'dropbox'
  | 'box'
  | 'clio';

export interface IntegrationProviderStatus {
  providerKey: IntegrationProviderKey;
  nangoIntegrationId: string;
  labelKey: string;
  icon: string;
  enabled: boolean;
  status: IntegrationConnectionStatus;
  connectionId?: string;
  connectedAt?: string;
  updatedAt?: string;
}

export interface IntegrationsListResponse {
  integrations: IntegrationProviderStatus[];
}

export interface IntegrationStatusResponse {
  integration: IntegrationProviderStatus;
}

export interface IntegrationConnectParamsResponse {
  nangoIntegrationId: string;
  connectionId: string;
}

export interface IntegrationConfirmResponse {
  providerKey: IntegrationProviderKey;
  status: IntegrationConnectionStatus;
  connectionId: string;
}
