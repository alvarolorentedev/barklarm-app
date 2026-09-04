import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CONFIG_FILE = 'config.json';

function getConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const configDir = join(home, '.config', 'barklarm');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return join(configDir, CONFIG_FILE);
}

function readConfig(): Record<string, any> {
  const path = getConfigPath();
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch {
    // corrupted config, start fresh
  }
  return {};
}

function writeConfig(data: Record<string, any>): void {
  writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
}

export const store = {
  get(key: string): any {
    return readConfig()[key];
  },

  set(key: string, value: any): void {
    const config = readConfig();
    config[key] = value;
    writeConfig(config);
  },

  getAll(): Record<string, any> {
    return readConfig();
  },

  setAll(data: Record<string, any>): void {
    writeConfig(data);
  },

  importConfig(filePath: string): boolean {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      writeConfig(data);
      return true;
    } catch {
      return false;
    }
  },

  exportConfig(filePath: string): boolean {
    try {
      writeFileSync(filePath, JSON.stringify(readConfig(), null, 2));
      return true;
    } catch {
      return false;
    }
  },
};
