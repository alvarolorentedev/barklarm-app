import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const AzureDevOps = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('Organization Url')}
      variant="standard"
      value={observable.orgUrl}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('orgUrl', index, event.target.value)
      }
    />
    <TextField
      label={translate('Project')}
      variant="standard"
      value={observable.project}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('project', index, event.target.value)
      }
    />
    <TextField
      label={translate('Pipeline ID')}
      variant="standard"
      value={observable.pipelineId}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('pipelineId', index, event.target.value)
      }
    />
    <TextField
      label={translate('Authorization Token')}
      variant="standard"
      type="password"
      value={observable.authToken}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('authToken', index, event.target.value)
      }
    />
  </>
);
