import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const GithubAction = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('Owner')}
      variant="standard"
      value={observable.owner}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('owner', index, event.target.value)
      }
    />
    <TextField
      label={translate('Repository')}
      variant="standard"
      value={observable.repo}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('repo', index, event.target.value)}
    />
    <TextField
      label={translate('Workflow ID')}
      variant="standard"
      value={observable.workflowId}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('workflowId', index, event.target.value)
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
