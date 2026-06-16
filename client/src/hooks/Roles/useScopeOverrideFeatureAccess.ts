import { useMemo } from 'react';
import {
  Permissions,
  PermissionTypes,
  PERMISSION_TYPE_INTERFACE_FIELDS,
  SCOPE_OVERRIDE_INTERFACE_FIELDS,
  isInterfacePermissionUseEnabled,
} from 'librechat-data-provider';
import type { TInterfaceConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import useHasAccess from './useHasAccess';

type ScopeOverridePermissionType = PermissionTypes.SKILLS | PermissionTypes.PROMPTS;

export default function useScopeOverrideFeatureAccess(
  permissionType: ScopeOverridePermissionType,
  permission: Permissions = Permissions.USE,
): boolean {
  const roleAccess = useHasAccess({ permissionType, permission });
  const { data: startupConfig, isLoading } = useGetStartupConfig();

  return useMemo(() => {
    if (!roleAccess) {
      return false;
    }
    const field = PERMISSION_TYPE_INTERFACE_FIELDS[permissionType];
    if (!SCOPE_OVERRIDE_INTERFACE_FIELDS.has(field)) {
      return roleAccess;
    }
    if (isLoading) {
      return false;
    }
    const interfaceConfig = startupConfig?.interface;
    if (!interfaceConfig) {
      return roleAccess;
    }
    const value = interfaceConfig[field as keyof TInterfaceConfig];
    return isInterfacePermissionUseEnabled(
      value as Parameters<typeof isInterfacePermissionUseEnabled>[0],
    );
  }, [roleAccess, permissionType, startupConfig?.interface, isLoading]);
}
