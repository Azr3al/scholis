import { afterEach, describe, expect, it } from 'vitest';
import { devRoutesEnabled } from './dev-enabled';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

// These endpoints create an org and hand out a sign-in link with no auth, so
// the guard is the only thing standing between them and the internet.
describe('devRoutesEnabled', () => {
  it('is off by default', () => {
    delete process.env.NODE_ENV;
    delete process.env.SCHOLIS_DEV_ROUTES;
    expect(devRoutesEnabled()).toBe(false);
  });

  it('still needs the opt-in when NODE_ENV is unset', () => {
    // The case that made the old NODE_ENV-only check risky: an unset NODE_ENV
    // used to fall straight through to "not production". Now the opt-in is
    // what actually decides, so forgetting it leaves the routes off.
    delete process.env.NODE_ENV;
    expect(devRoutesEnabled()).toBe(false);

    process.env.SCHOLIS_DEV_ROUTES = 'enabled';
    expect(devRoutesEnabled()).toBe(true);
  });

  it('is off in production even with the opt-in set', () => {
    process.env.NODE_ENV = 'production';
    process.env.SCHOLIS_DEV_ROUTES = 'enabled';
    expect(devRoutesEnabled()).toBe(false);
  });

  it('is off in development without the opt-in', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SCHOLIS_DEV_ROUTES;
    expect(devRoutesEnabled()).toBe(false);
  });

  it('needs the exact value, not just any truthy string', () => {
    process.env.NODE_ENV = 'development';
    for (const value of ['true', '1', 'yes', 'ENABLED', '']) {
      process.env.SCHOLIS_DEV_ROUTES = value;
      expect(devRoutesEnabled()).toBe(false);
    }
  });

  it('is on only for development plus the exact opt-in', () => {
    process.env.NODE_ENV = 'development';
    process.env.SCHOLIS_DEV_ROUTES = 'enabled';
    expect(devRoutesEnabled()).toBe(true);
  });
});
