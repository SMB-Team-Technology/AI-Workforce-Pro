import { getInterfacePermissionUse, isInterfacePermissionUseEnabled } from './permissions';

describe('interface permission helpers', () => {
  describe('getInterfacePermissionUse', () => {
    it('returns boolean values as-is', () => {
      expect(getInterfacePermissionUse(true)).toBe(true);
      expect(getInterfacePermissionUse(false)).toBe(false);
    });

    it('reads use from object config', () => {
      expect(getInterfacePermissionUse({ use: false })).toBe(false);
      expect(getInterfacePermissionUse({ use: true })).toBe(true);
    });

    it('returns undefined when config is absent', () => {
      expect(getInterfacePermissionUse(undefined)).toBeUndefined();
    });
  });

  describe('isInterfacePermissionUseEnabled', () => {
    it('treats explicit false as disabled', () => {
      expect(isInterfacePermissionUseEnabled(false)).toBe(false);
      expect(isInterfacePermissionUseEnabled({ use: false })).toBe(false);
    });

    it('treats absent or enabled config as allowed at interface layer', () => {
      expect(isInterfacePermissionUseEnabled(undefined)).toBe(true);
      expect(isInterfacePermissionUseEnabled(true)).toBe(true);
      expect(isInterfacePermissionUseEnabled({ use: true })).toBe(true);
      expect(isInterfacePermissionUseEnabled({ create: false })).toBe(true);
    });
  });
});
