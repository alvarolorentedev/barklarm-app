import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers as any);

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe(): void {
    // no-op for jsdom
  }

  unobserve(): void {
    // no-op for jsdom
  }

  disconnect(): void {
    // no-op for jsdom
  }
}

(globalThis as any).ResizeObserver = ResizeObserverMock;

if (!window.matchMedia) {
  (window as any).matchMedia = () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
