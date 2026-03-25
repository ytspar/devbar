/**
 * Device Emulation
 *
 * Named device presets using Playwright's built-in device definitions.
 * Supports batch screenshots at multiple viewports/devices.
 */

type Page = import('playwright').Page;

// ============================================================================
// Device Presets
// ============================================================================

export interface DeviceConfig {
  name: string;
  viewport: { width: number; height: number };
  userAgent?: string;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

/**
 * Built-in device presets. Subset of Playwright's device library
 * covering the most common testing targets.
 */
export const DEVICE_PRESETS: Record<string, DeviceConfig> = {
  'iphone-14': {
    name: 'iPhone 14',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-se': {
    name: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'pixel-7': {
    name: 'Pixel 7',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  'ipad-pro-11': {
    name: 'iPad Pro 11',
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'ipad-mini': {
    name: 'iPad Mini',
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    name: 'Desktop',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
  },
  'desktop-hd': {
    name: 'Desktop HD',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
  },
};

/**
 * Parse a device name (case-insensitive) to a DeviceConfig.
 * Falls back to custom viewport parsing for "WIDTHxHEIGHT" format.
 */
export function parseDevice(name: string): DeviceConfig | null {
  const normalized = name.toLowerCase().replace(/\s+/g, '-');

  // Check presets
  if (DEVICE_PRESETS[normalized]) {
    return DEVICE_PRESETS[normalized]!;
  }

  // Try WIDTHxHEIGHT format
  const match = name.match(/^(\d+)x(\d+)$/);
  if (match) {
    return {
      name: `Custom ${match[1]}x${match[2]}`,
      viewport: { width: parseInt(match[1]!, 10), height: parseInt(match[2]!, 10) },
    };
  }

  return null;
}

/**
 * Take screenshots at multiple device configurations.
 */
export async function takeDeviceScreenshots(
  page: Page,
  devices: string[],
  options?: { fullPage?: boolean }
): Promise<Array<{ device: DeviceConfig; buffer: Buffer }>> {
  const results: Array<{ device: DeviceConfig; buffer: Buffer }> = [];
  const originalViewport = page.viewportSize() ?? { width: 1440, height: 900 };

  for (const deviceName of devices) {
    const device = parseDevice(deviceName);
    if (!device) {
      console.error(`[Daemon] Unknown device: ${deviceName}`);
      continue;
    }

    await page.setViewportSize(device.viewport);
    await page.waitForTimeout(100); // Let layout settle
    const buffer = await page.screenshot({ fullPage: options?.fullPage });
    results.push({ device, buffer });
  }

  // Restore original viewport
  await page.setViewportSize(originalViewport);

  return results;
}
