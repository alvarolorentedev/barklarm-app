export default {
  app: {
    name: 'Barklarm',
    description: 'Build & Observability Radiator',
    identifier: 'dev.barklarm.app',
    icon: './icon.iconset',
  },
  build: {
    mainProcess: 'cottontail',
    sourceMap: false,
    minify: true,
    target: 'es2020',
    cottontail: {
      entrypoint: 'src/bun/index.ts',
    },
    views: {},
    copy: {
      'dist/mainview': 'views/mainview',
    },
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  signing: {
    mac: {
      identity: '$MAC_DEVELOPER_ID',
      teamId: '$MAC_APPLE_TEAM_ID',
      hardenedRuntime: true,
      entitlements: './build/entitlements.plist',
    },
    win: {
      certificate: '$WINDOWS_CERTIFICATE',
      password: '$WINDOWS_PFX_SECRET',
    },
  },
  updater: {
    provider: 'github',
    owner: 'barklarm',
    repo: 'barklarm-app',
    autoUpdate: true,
  },
  platforms: {
    darwin: {
      target: 'dmg',
      arch: ['arm64', 'x64'],
    },
    linux: {
      target: 'AppImage',
      arch: ['x64', 'arm64'],
    },
    win32: {
      target: 'nsis',
      arch: ['x64'],
    },
  },
};
