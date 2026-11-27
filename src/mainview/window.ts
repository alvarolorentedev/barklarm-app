export function isTrayWindow(): boolean {
  return new URLSearchParams(window.location.search).get('window') === 'tray';
}
