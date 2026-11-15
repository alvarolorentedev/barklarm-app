import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';
import { MenuItem } from '../../../mainview/components/fields/Select';
import Select from '../../../mainview/components/fields/Select';

export const NewRelic = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <Select
      value={observable.site}
      label={translate('Site')}
      variant="standard"
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('site', index, event.target.value)}
    >
      <MenuItem value={'eu.newrelic.com'}>EU</MenuItem>
      <MenuItem value={'newrelic.com'}>OTHERS</MenuItem>
    </Select>
    <TextField
      label={translate('API Key')}
      variant="standard"
      type="password"
      value={observable.apiKey}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('apiKey', index, event.target.value)
      }
    />
  </>
);
