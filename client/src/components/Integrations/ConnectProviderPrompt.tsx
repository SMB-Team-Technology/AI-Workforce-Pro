import React from 'react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogDescription,
  OGDialogTitle,
  Spinner,
} from '@librechat/client';
import type { IntegrationConnectionStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { IntegrationStatusChip } from './IntegrationStatusChip';

interface ConnectProviderPromptProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  labelKey: string;
  status?: IntegrationConnectionStatus;
  isConnecting?: boolean;
  onConnect: () => void;
}

export function ConnectProviderPrompt({
  isOpen,
  onOpenChange,
  labelKey,
  status,
  isConnecting = false,
  onConnect,
}: ConnectProviderPromptProps) {
  const localize = useLocalize();
  const providerLabel = localize(labelKey as Parameters<typeof localize>[0]);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-w-md">
        <OGDialogTitle>
          {localize('com_integrations_connect_title', { provider: providerLabel })}
        </OGDialogTitle>
        <OGDialogDescription>
          {localize('com_integrations_connect_description', { provider: providerLabel })}
        </OGDialogDescription>

        <div className="mt-4 flex items-center gap-2">
          <IntegrationStatusChip status={status} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConnecting}>
            {localize('com_ui_cancel')}
          </Button>
          <Button variant="submit" onClick={onConnect} disabled={isConnecting}>
            {isConnecting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                {localize('com_ui_loading')}
              </>
            ) : (
              localize('com_integrations_connect_button')
            )}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
