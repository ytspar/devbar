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
 * Short aliases that resolve to a canonical preset key. Lets users say
 * `ipad` instead of remembering `ipad-mini` vs `ipad-pro-11`.
 */
const DEVICE_ALIASES: Record<string, string> = {
  iphone: 'iphone-14',
  ipad: 'ipad-mini',
  pixel: 'pixel-7',
  android: 'pixel-7',
  mobile: 'iphone-14',
  tablet: 'ipad-mini',
};

/** Names a user might type (presets + aliases) for help/error messages. */
export function listDeviceNames(): string[] {
  return [
    ...Object.keys(DEVICE_PRESETS),
    ...Object.keys(DEVICE_ALIASES).map((a) => `${a} (→${DEVICE_ALIASES[a]})`),
  ].sort();
}

/**
 * Parse a device name (case-insensitive) to a DeviceConfig.
 * Falls back to custom viewport parsing for "WIDTHxHEIGHT" format.
 */
export function parseDevice(name: string): DeviceConfig | null {
  const normalized = name.toLowerCase().replace(/\s+/g, '-');
  const resolved = DEVICE_ALIASES[normalized] ?? normalized;

  // Check presets
  if (DEVICE_PRESETS[resolved]) {
    return DEVICE_PRESETS[resolved]!;
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
): Promise<{
  results: Array<{ device: DeviceConfig; buffer: Buffer }>;
  unknown: string[];
}> {
  const results: Array<{ device: DeviceConfig; buffer: Buffer }> = [];
  const unknown: string[] = [];
  const originalViewport = page.viewportSize() ?? { width: 1440, height: 900 };

  for (const deviceName of devices) {
    const device = parseDevice(deviceName);
    if (!device) {
      unknown.push(deviceName);
      continue;
    }

    await page.setViewportSize(device.viewport);
    await page.waitForTimeout(100); // Let layout settle
    const buffer = await page.screenshot({ fullPage: options?.fullPage });
    results.push({ device, buffer });
  }

  // Restore original viewport
  await page.setViewportSize(originalViewport);

  return { results, unknown };
}
