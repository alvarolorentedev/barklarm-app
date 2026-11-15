import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const Graylog = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('URL')}
      variant="standard"
      value={observable.url}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('url', index, event.target.value)}
    />
    <TextField
      label={translate('Stream Id')}
      variant="standard"
      value={observable.streamId}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('streamId', index, event.target.value)
      }
    />
    <TextField
      label={translate('Username')}
      variant="standard"
      value={observable.username}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('username', index, event.target.value)
      }
    />
    <TextField
      label={translate('Password')}
      variant="standard"
      type="password"
      value={observable.password}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('password', index, event.target.value)
      }
    />
  </>
);
