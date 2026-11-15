import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const Bitbucket = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('Workspace')}
      variant="standard"
      value={observable.workspace}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('workspace', index, event.target.value)
      }
    />
    <TextField
      label={translate('Repository')}
      variant="standard"
      value={observable.repo}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('repo', index, event.target.value)}
    />
    <TextField
      label={translate('Branch')}
      variant="standard"
      value={observable.branch}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('branch', index, event.target.value)
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
