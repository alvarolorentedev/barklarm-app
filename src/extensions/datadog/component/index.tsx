import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';
import { MenuItem } from '../../../mainview/components/fields/Select';
import Select from '../../../mainview/components/fields/Select';

export const DatadogMonitor = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <Select
      value={observable.site}
      label={translate('Site')}
      variant="standard"
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('site', index, event.target.value)}
    >
      <MenuItem value={'datadoghq.eu'}>EU</MenuItem>
      <MenuItem value={'datadoghq.com'}>US</MenuItem>
      <MenuItem value={'us3.datadoghq.com'}>US3</MenuItem>
      <MenuItem value={'us5.datadoghq.com'}>US5</MenuItem>
      <MenuItem value={'dddog-gov.com'}>US1-FED</MenuItem>
    </Select>
    <TextField
      label={translate('Monitor ID')}
      variant="standard"
      value={observable.monitorId}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('monitorId', index, event.target.value)
      }
    />
    <TextField
      label={translate('API Key')}
      variant="standard"
      type="password"
      value={observable.apiKey}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('apiKey', index, event.target.value)
      }
    />
    <TextField
      label={translate('Application Key')}
      variant="standard"
      type="password"
      value={observable.appKey}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('appKey', index, event.target.value)
      }
    />
  </>
);
