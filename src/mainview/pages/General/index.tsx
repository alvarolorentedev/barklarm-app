import { useState, useEffect } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import { storage } from './helpers/storage';
import TextField from '@mui/material/TextField';
import LogoutIcon from '@mui/icons-material/Logout';

export const General = () => {
  const [autoupdate, setAutoupdate] = useState(true);
  const [sslDisabled, setsslDisabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [issueGlobalEndpoint, setissueGlobalEndpoint] = useState('');
  const [autostart, setAutostart] = useState(true);
  const {
    getAutoupdate,
    saveAutoupdate,
    getSslDisabled,
    saveSslDisabled,
    getRefreshInterval,
    saveRefreshInterval,
    getissueGlobalEndpoint,
    saveissueGlobalEndpoint,
    getAutostart,
    saveAutostart,
    importConfig,
    exportConfig,
    quit,
  } = storage();

  useEffect(() => {
    Promise.all([
      getAutoupdate(),
      getSslDisabled(),
      getRefreshInterval(),
      getissueGlobalEndpoint(),
      getAutostart(),
    ]).then(([au, ssl, ri, ige, as]) => {
      setAutoupdate(au);
      setsslDisabled(ssl);
      setRefreshInterval(ri);
      setissueGlobalEndpoint(ige);
      setAutostart(as);
    });
  }, []);

  const translateFn = (key: string) => key;

  return (
    <Stack>
      <Divider sx={{ my: 2 }}>{translateFn('General')}</Divider>
      <TextField
        label={translateFn('Refresh Interval (Minutes)')}
        type="number"
        variant="standard"
        value={refreshInterval / 60000}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const targetInterval: number = (event.target.value as any) * 60000;
          if (targetInterval < 60000) return;
          saveRefreshInterval(targetInterval);
          setRefreshInterval(targetInterval);
        }}
      />
      <TextField
        label={translateFn('issues Global Endpoint')}
        type="text"
        variant="standard"
        value={issueGlobalEndpoint}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          saveissueGlobalEndpoint(event.target.value);
          setissueGlobalEndpoint(event.target.value);
        }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={autostart}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              saveAutostart(event.target.checked);
              setAutostart(event.target.checked);
            }}
          />
        }
        label={translateFn('Auto Start')}
      />
      <FormControlLabel
        control={
          <Switch
            checked={autoupdate}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              saveAutoupdate(event.target.checked);
              setAutoupdate(event.target.checked);
            }}
          />
        }
        label={translateFn('Auto Update')}
      />
      <Divider sx={{ my: 2 }}>{translateFn('Backup')}</Divider>
      <Stack spacing={2} direction="row">
        <Button variant="contained" onClick={() => importConfig()}>
          {translateFn('Import')}
        </Button>
        <Button variant="contained" onClick={() => exportConfig()}>
          {translateFn('Export')}
        </Button>
      </Stack>
      <Divider sx={{ my: 2 }}>{translateFn('Advanced')}</Divider>
      <FormControlLabel
        control={
          <Switch
            checked={sslDisabled}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              saveSslDisabled(event.target.checked);
              setsslDisabled(event.target.checked);
            }}
          />
        }
        label={translateFn('Disable SSL Check')}
      />
      <Divider sx={{ my: 2 }}>{translateFn('Application')}</Divider>
      <Stack spacing={2} direction="row">
        <Button variant="contained" color="error" startIcon={<LogoutIcon />} onClick={() => quit()}>
          {translateFn('Quit Barklarm')}
        </Button>
      </Stack>
    </Stack>
  );
};
