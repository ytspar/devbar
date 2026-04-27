import { afterEach, describe, expect, it } from 'vitest';
import {
  installSimulatedSweetlinkBridge,
  shouldUseSimulatedSweetlinkBridge,
} from './simulated-sweetlink.js';

const demoLocation = {
  hostname: 'devbar.dev',
  origin: 'https://devbar.dev',
  pathname: '/',
  port: '',
  protocol: 'https:',
  search: '',
};

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.onmessage = (event) => resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
  });
}

describe('simulated Sweetlink bridge', () => {
  const originalWebSocket = window.WebSocket;

  afterEach(() => {
    window.WebSocket = originalWebSocket;
    delete window.__devbarSweetlinkDemo;
  });

  it('enables simulation on the public site and local dev by default', () => {
    expect(shouldUseSimulatedSweetlinkBridge(demoLocation)).toBe(true);
    expect(
      shouldUseSimulatedSweetlinkBridge({
        ...demoLocation,
        hostname: 'localhost',
        origin: 'http://localhost:5173',
        port: '5173',
        protocol: 'http:',
      })
    ).toBe(true);
  });

  it('allows the real bridge to be requested explicitly', () => {
    expect(shouldUseSimulatedSweetlinkBridge({ ...demoLocation, search: '?sweetlink=real' })).toBe(
      false
    );
  });

  it('emits server-info and saved artifact responses', async () => {
    const bridge = installSimulatedSweetlinkBridge({ force: true, location: demoLocation });
    expect(bridge.active).toBe(true);
    expect(window.__devbarSweetlinkDemo).toBe(true);

    const ws = new WebSocket('ws://localhost:3999');
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const serverInfo = waitForMessage(ws);
    ws.send(JSON.stringify({ type: 'browser-client-ready' }));
    await expect(serverInfo).resolves.toMatchObject({
      type: 'server-info',
      appName: 'devbar.dev demo',
      demo: true,
      gitBranch: 'simulated',
    });

    const feedback = new Promise<CustomEvent>((resolve) => {
      window.addEventListener('sweetlink-demo-action', (event) => resolve(event as CustomEvent), {
        once: true,
      });
    });
    const screenshot = waitForMessage(ws);
    ws.send(JSON.stringify({ type: 'save-screenshot' }));
    await expect(screenshot).resolves.toMatchObject({
      type: 'screenshot-saved',
      demo: true,
    });
    await expect(feedback).resolves.toMatchObject({
      detail: {
        title: 'Screenshot simulated',
        message: expect.stringContaining('No image file was written'),
      },
    });

    bridge.restore();
    expect(window.WebSocket).toBe(originalWebSocket);
  });
});
