import { Controller, useFormContext } from 'react-hook-form';
import { Checkbox } from '@librechat/client';
import { Tools } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

export default function GoogleDriveForm() {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();

  return (
    <div className="flex items-center">
      <Controller
        name={Tools.google_drive}
        control={control}
        render={({ field }) => (
          <Checkbox
            {...field}
            id="google-drive-checkbox"
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
            value={String(field.value)}
            aria-labelledby="google-drive-label"
          />
        )}
      />
      <label
        id="google-drive-label"
        htmlFor="google-drive-checkbox"
        className="form-check-label text-token-text-primary cursor-pointer text-sm"
      >
        {localize('com_ui_google_drive')}
      </label>
    </div>
  );
}
