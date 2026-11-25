module.exports = {
  '*.{ts,tsx}': ['bun run tsc:check', 'bun run format:fix', 'bun run lint:fix', 'bun run test'],
};
