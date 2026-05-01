/**
 * Smoke tests for landing page content sections.
 *
 * Verifies each exported function returns a valid HTMLElement with key content.
 */

import { describe, expect, it } from 'vitest';
import {
  createAgentSetupSection,
  createChangelogSection,
  createFeaturesSection,
  createLandingHero,
  createPackagesSection,
  createQuickStartSection,
  createSweetlinkSection,
} from './landing-content';

describe('Landing Content', () => {
  describe('createLandingHero', () => {
    it('returns an HTMLElement', () => {
      const el = createLandingHero();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('contains the product name', () => {
      const el = createLandingHero();
      expect(el.textContent).toContain('devbar');
    });
  });

  describe('createAgentSetupSection', () => {
    it('returns an HTMLElement', () => {
      const el = createAgentSetupSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('links to the LLM setup guide', () => {
      const el = createAgentSetupSection();
      expect(el.textContent).toContain('llms.txt');
      expect(el.textContent).toContain('pnpm sweetlink inspect');
    });
  });

  describe('createFeaturesSection', () => {
    it('returns an HTMLElement', () => {
      const el = createFeaturesSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('contains feature cards', () => {
      const el = createFeaturesSection();
      expect(el.textContent).toContain('devbar');
    });
  });

  describe('createSweetlinkSection', () => {
    it('returns an HTMLElement', () => {
      const el = createSweetlinkSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('mentions sweetlink', () => {
      const el = createSweetlinkSection();
      expect(el.textContent?.toLowerCase()).toContain('sweetlink');
    });
  });

  describe('createPackagesSection', () => {
    it('returns an HTMLElement', () => {
      const el = createPackagesSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('lists package names', () => {
      const el = createPackagesSection();
      const text = el.textContent ?? '';
      expect(text).toContain('@ytspar/devbar');
      expect(text).toContain('@ytspar/sweetlink');
    });
  });

  describe('createQuickStartSection', () => {
    it('returns an HTMLElement', () => {
      const el = createQuickStartSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('contains install instructions', () => {
      const el = createQuickStartSection();
      expect(el.textContent).toContain('npm');
    });
  });

  describe('createChangelogSection', () => {
    it('returns an HTMLElement', () => {
      const el = createChangelogSection();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('contains release data', () => {
      const el = createChangelogSection();
      expect(el.textContent).toContain('Releases');
    });
  });
});
