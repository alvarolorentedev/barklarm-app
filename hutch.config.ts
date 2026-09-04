export default {
  electrobun: {
    version: '2.0.1',
  },
  scripts: {
    install: ['hutch', 'install', '--frozen-lockfile'],
    dev: ['hutch', 'electrobun', 'dev', '--watch'],
    build: ['hutch', 'electrobun', 'build'],
    'build:mac': ['hutch', 'electrobun', 'build', '--platform', 'darwin'],
    'build:linux': ['hutch', 'electrobun', 'build', '--platform', 'linux'],
    'build:win': ['hutch', 'electrobun', 'build', '--platform', 'win32'],
  },
};
