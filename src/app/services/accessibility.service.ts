// src/app/services/accessibility.service.ts

import { Injectable } from '@angular/core';

const LARGE_TEXT_KEY = 'accessibility.largeText';
const HIGH_CONTRAST_KEY = 'accessibility.highContrast';

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private enabled = false;
  private highContrast = false;

  constructor() {
    // ✅ Texto grande
    const savedLarge = this.safeGetItem(LARGE_TEXT_KEY);
    this.enabled = savedLarge === 'true';

    // ✅ Alto contraste
    const savedHC = this.safeGetItem(HIGH_CONTRAST_KEY);
    this.highContrast = savedHC === '1';

    // ✅ aplicar ambos al iniciar
    this.applyLargeText();
    this.applyHighContrast();
  }

  // ===== TEXTO GRANDE =====
  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(value: boolean) {
    this.enabled = value;
    this.safeSetItem(LARGE_TEXT_KEY, String(value));
    this.applyLargeText();
  }

  private applyLargeText() {
    try {
      document.documentElement.classList.toggle('large-text', this.enabled); // ✅ HTML
      document.body.classList.toggle('large-text', this.enabled);            // ✅ BODY
    } catch {}
  }

  // ===== ALTO CONTRASTE =====
  isHighContrastEnabled(): boolean {
    return this.highContrast;
  }

  setHighContrast(enabled: boolean) {
    this.highContrast = enabled;
    this.safeSetItem(HIGH_CONTRAST_KEY, enabled ? '1' : '0');
    this.applyHighContrast();
  }

  private applyHighContrast() {
    this.toggleClassOnRootAndBody('high-contrast', this.highContrast);
  }

  // ===== HELPERS (safe + global) =====
  private toggleClassOnRootAndBody(className: string, enabled: boolean) {
    try {
      // html
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.toggle(className, enabled);
      }
      // body
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle(className, enabled);
      }
    } catch {
      // no-op
    }
  }

  private safeGetItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSetItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // no-op
    }
  }
}
