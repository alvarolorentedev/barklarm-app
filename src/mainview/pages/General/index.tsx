import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { SettingsGroup, SettingsRow } from '../../components/SettingsGroup';
import Switch from '../../components/fields/Switch';
import { translate } from '../../i18n';
import { storage } from './helpers/storage';

export const General = () => {
  const [sslDisabled, setSslDisabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [issueGlobalEndpoint, setIssueGlobalEndpoint] = useState('');
  const [autostart, setAutostart] = useState(true);
  const {
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
    Promise.all([getSslDisabled(), getRefreshInterval(), getissueGlobalEndpoint(), getAutostart()]).then(
      ([ssl, interval, endpoint, startAtLogin]) => {
        setSslDisabled(ssl);
        setRefreshInterval(interval);
        setIssueGlobalEndpoint(endpoint);
        setAutostart(startAtLogin);
      }
    );
  }, []);

  const updateRefreshInterval = (event: React.ChangeEvent<HTMLInputElement>) => {
    const targetInterval = Number(event.target.value) * 60000;
    if (!Number.isFinite(targetInterval) || targetInterval < 60000) return;
    saveRefreshInterval(targetInterval);
    setRefreshInterval(targetInterval);
  };

  return (
    <div className="page">
      <PageHeader
        title={translate('General')}
        description="Configure how Barklarm refreshes, starts, and stores its data."
      />

      <SettingsGroup title={translate('Monitoring')}>
        <SettingsRow label={translate('Refresh interval')} description="How often observers are checked.">
          <div className="number-field">
            <input
              className="input input-number"
              type="number"
              min={1}
              value={refreshInterval / 60000}
              onChange={updateRefreshInterval}
              aria-label={translate('Refresh interval')}
            />
            <span className="input-suffix">{translate('minutes')}</span>
          </div>
        </SettingsRow>
        <SettingsRow
          label={translate('Issue endpoint')}
          description="Optional global endpoint used when opening an issue."
        >
          <input
            className="input input-wide"
            type="text"
            value={issueGlobalEndpoint}
            onChange={(event) => {
              saveissueGlobalEndpoint(event.target.value);
              setIssueGlobalEndpoint(event.target.value);
            }}
            placeholder="https://..."
            aria-label={translate('Issue endpoint')}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={translate('Startup')}>
        <SettingsRow label={translate('Start at login')} description="Start Barklarm in the tray when you log in.">
          <Switch
            checked={autostart}
            ariaLabel={translate('Start at login')}
            onChange={(event) => {
              saveAutostart(event.target.checked);
              setAutostart(event.target.checked);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={translate('Backup')}>
        <SettingsRow label={translate('Configuration')} description="Import or export your observers and settings.">
          <div className="button-row">
            <button type="button" className="button" onClick={() => void importConfig()}>
              {translate('Import')}
            </button>
            <button type="button" className="button" onClick={() => void exportConfig()}>
              {translate('Export')}
            </button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={translate('Advanced')}>
        <SettingsRow
          label={translate('Disable SSL verification')}
          description="Only use this for self-signed certificates. Restart required."
        >
          <Switch
            checked={sslDisabled}
            ariaLabel={translate('Disable SSL verification')}
            onChange={(event) => {
              saveSslDisabled(event.target.checked);
              setSslDisabled(event.target.checked);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={translate('Application')}>
        <SettingsRow label={translate('Quit Barklarm')} description="Stop monitoring and close the tray app.">
          <button type="button" className="button danger" onClick={() => void quit()}>
            <LogOut size={14} aria-hidden="true" />
            {translate('Quit')}
          </button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
