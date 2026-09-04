/**
 * Capture the real Node process.exit before any third-party code (e.g. Electrobun)
 * gets a chance to replace it.
 */
export const nodeExit = process.exit;
