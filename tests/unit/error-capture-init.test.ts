// @vitest-environment node
import { expect, it, vi } from 'vitest';

it('does not register on import; explicit initialization is idempotent and captures errors', async () => {
  vi.resetModules();
  const original = console.error;
  const sink = vi.fn();
  console.error = sink;
  try {
    const capture = await import('../../src/lib/error-capture');
    expect(console.error).toBe(sink);
    capture.initializeErrorCapture();
    const installed = console.error;
    expect(installed).not.toBe(sink);
    capture.initializeErrorCapture();
    expect(console.error).toBe(installed);
    const error = new Error('explicit-init-regression');
    console.error(error);
    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0]?.[0]).toContain('explicit-init-regression');
    expect(capture.consumeLastCapturedError()).toBe(error);
    expect(capture.consumeLastCapturedError()).toBeUndefined();
  } finally {
    console.error = original;
  }
});