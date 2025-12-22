import { Injectable } from '@angular/core';

const LARGE_TEXT_KEY = 'accessibility.largeText';
const HIGH_CONTRAST_KEY = 'accessibility.highContrast';

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private enabled = false;
  private highContrast = false;

  constructor() {
    // ✅ Texto grande
    const savedLarge = localStorage.getItem(LARGE_TEXT_KEY);
    this.enabled = savedLarge === 'true';

    // ✅ Alto contraste
    const savedHC = localStorage.getItem(HIGH_CONTRAST_KEY);
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
    localStorage.setItem(LARGE_TEXT_KEY, String(value));
    this.applyLargeText();
  }

  private applyLargeText() {
    document.body.classList.toggle('large-text', this.enabled);
  }

  // ===== ALTO CONTRASTE =====
  isHighContrastEnabled(): boolean {
    return this.highContrast;
  }

  setHighContrast(enabled: boolean) {
    this.highContrast = enabled;
    localStorage.setItem(HIGH_CONTRAST_KEY, enabled ? '1' : '0');
    this.applyHighContrast();
  }

  private applyHighContrast() {
    document.body.classList.toggle('high-contrast', this.highContrast);
  }
}
