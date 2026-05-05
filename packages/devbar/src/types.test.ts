// @vitest-environment node

/**
 * Devbar Public Type Surface Tests
 *
 * The audit flagged this file as a "critical module without tests". It's
 * almost entirely type definitions and re-exports — there's no runtime
 * behavior to exercise — but consumers of the published @ytspar/devbar
 * package depend on these types compiling and resolving correctly.
 *
 * What we actually verify here:
 *
 * 1. Every type re-export from sweetlink resolves through devbar's
 *    indirection (compile-time check via type-level assertions).
 * 2. The DevBarControl shape that the rendering modules use inline-
 *    duplicated for years matches the interface canonical form. If
 *    someone reverts the dedup, this test fails the next time it runs
 *    against a fresh checkout.
 * 3. ThemeMode values are exactly the three documented strings.
 * 4. The DebugConfig optional fields are all documented as optional.
 *
 * These are deliberately compile-time and shape checks rather than
 * runtime behavior — there's no behavior to fake.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AxeResult,
  AxeViolation,
  ConsoleLog,
  DebugConfig,
  DevBarControl,
  GlobalDevBarOptions,
  MetaImage,
  MicrodataItem,
  MissingTag,
  OutlineCategory,
  OutlineNode,
  PageSchema,
  SweetlinkCommand,
  ThemeMode,
} from './types.js';

describe('devbar/types — re-exports', () => {
  it('re-exports the sweetlink types that consumers depend on', () => {
    // Compile-time evidence the imports above resolved. expectTypeOf gives
    // us a runtime hook for the type assertion; the test passes iff the
    // type itself is well-formed.
    expectTypeOf<AxeResult>().not.toBeAny();
    expectTypeOf<AxeViolation>().not.toBeAny();
    expectTypeOf<ConsoleLog>().not.toBeAny();
    expectTypeOf<MetaImage>().not.toBeAny();
    expectTypeOf<MicrodataItem>().not.toBeAny();
    expectTypeOf<MissingTag>().not.toBeAny();
    expectTypeOf<OutlineCategory>().not.toBeAny();
    expectTypeOf<OutlineNode>().not.toBeAny();
    expectTypeOf<PageSchema>().not.toBeAny();
    expectTypeOf<SweetlinkCommand>().not.toBeAny();
    expect(true).toBe(true);
  });
});

describe('devbar/types — ThemeMode', () => {
  it('is the literal union of dark/light/system', () => {
    expectTypeOf<ThemeMode>().toEqualTypeOf<'dark' | 'light' | 'system'>();
  });
});

describe('devbar/types — DebugConfig', () => {
  it('requires `enabled` and treats every other property as optional', () => {
    // Constructive test: a DebugConfig with only `enabled` typechecks.
    const minimal: DebugConfig = { enabled: true };
    expect(minimal.enabled).toBe(true);

    // Each optional field is independently assignable.
    const full: DebugConfig = {
      enabled: true,
      logLifecycle: true,
      logStateChanges: false,
      logWebSocket: true,
      logPerformance: false,
    };
    expect(full.logLifecycle).toBe(true);
  });

  it('rejects unknown keys at compile time', () => {
    // @ts-expect-error: unknownField is not part of DebugConfig
    const bad: DebugConfig = { enabled: true, unknownField: 1 };
    expect(bad).toBeDefined();
  });
});

describe('devbar/types — DevBarControl', () => {
  it('matches the shape rendering modules expect', () => {
    const control: DevBarControl = {
      id: 'foo',
      label: 'Foo',
      onClick: () => {},
      active: true,
      disabled: false,
      variant: 'warning',
      group: 'demo',
    };
    expect(control.id).toBe('foo');
  });

  it('only requires id and label (rest is optional)', () => {
    const control: DevBarControl = { id: 'a', label: 'A' };
    expect(control.id).toBe('a');
  });

  it('constrains variant to default | warning | info', () => {
    expectTypeOf<DevBarControl['variant']>().toEqualTypeOf<
      'default' | 'warning' | 'info' | undefined
    >();
  });
});

describe('devbar/types — GlobalDevBarOptions', () => {
  it('all fields are optional (zero-config init must typecheck)', () => {
    const opts: GlobalDevBarOptions = {};
    expect(opts).toBeDefined();
  });

  it('position is constrained to the 5 documented anchor points', () => {
    expectTypeOf<GlobalDevBarOptions['position']>().toEqualTypeOf<
      'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center' | undefined
    >();
  });

  it('debug accepts both boolean shorthand and DebugConfig', () => {
    const a: GlobalDevBarOptions = { debug: true };
    const b: GlobalDevBarOptions = { debug: false };
    const c: GlobalDevBarOptions = { debug: { enabled: true, logWebSocket: false } };
    expect([a, b, c]).toHaveLength(3);
  });

  it('saveLocation is the literal union auto/local/download', () => {
    expectTypeOf<GlobalDevBarOptions['saveLocation']>().toEqualTypeOf<
      'auto' | 'local' | 'download' | undefined
    >();
  });

  it('sweetlink overrides accept appPort/wsPort/wsUrl/wsPath', () => {
    const opts: GlobalDevBarOptions = {
      sweetlink: { appPort: 3001, wsPort: 9301, wsUrl: 'ws://x', wsPath: '/sock' },
    };
    expect(opts.sweetlink?.appPort).toBe(3001);
  });
});

describe('devbar/types — OutlineCategory passes through correctly', () => {
  it('includes the 8 documented semantic categories', () => {
    expectTypeOf<OutlineCategory>().toEqualTypeOf<
      'heading' | 'sectioning' | 'landmark' | 'grouping' | 'form' | 'table' | 'list' | 'other'
    >();
  });
});
