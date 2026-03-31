/**
 * UrlSchemeHandler — URL scheme based app activation
 *
 * Handles deep links and URL scheme launches:
 *   mobileclaw://activate          → Full activation (camera + mic + gateway)
 *   mobileclaw://activate?gw=home  → Activate with specific gateway
 *
 * Supports two launch scenarios:
 *   1. Cold start: App launched from closed state via URL
 *   2. Warm start: App already running, brought to foreground via URL
 *
 * Uses React Native's built-in Linking API (no custom native code needed).
 */

import { Linking } from 'react-native';
import { wakeUpManager } from './WakeUpManager';
import { getLogger } from '@/utils/logger';
import { URL_SCHEME, URL_ACTIVATE_PATH } from '@/utils/constants';

const log = getLogger('UrlScheme');

/** Parsed URL scheme activation parameters */
export interface ActivationParams {
  /** Specific gateway ID to use (optional, uses active gateway if omitted) */
  gatewayId?: string;
  /** Whether this was a background/Siri-triggered activation */
  siriInitiated?: boolean;
}

class UrlSchemeHandler {
  private initialized = false;

  /**
   * Initialize URL scheme handler.
   * Must be called once at app startup (in App.tsx).
   *
   * Handles:
   *   - Cold start: Linking.getInitialURL() for app launched via URL
   *   - Warm start: Linking.addEventListener('url', ...) for foreground events
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Handle cold start: app was launched via URL scheme
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      log.info('Cold start URL:', initialUrl);
      this.handleUrl(initialUrl);
    }

    // Handle warm start: app already running, URL opened
    const subscription = Linking.addEventListener('url', (event) => {
      log.info('Warm start URL:', event.url);
      this.handleUrl(event.url);
    });

    this.initialized = true;
    log.info('URL scheme handler initialized (scheme: %s)', URL_SCHEME);

    // Return unsubscribe for cleanup (not normally needed)
    return () => subscription.remove();
  }

  /**
   * Parse and handle a mobileclaw:// URL.
   */
  private handleUrl(url: string): void {
    try {
      // Only handle our own scheme
      if (!url.startsWith(`${URL_SCHEME}://`)) {
        log.debug('Ignoring non-mobileclaw URL:', url.slice(0, 30));
        return;
      }

      const parsed = new URL(url);
      const pathname = parsed.pathname; // e.g., "/activate"
      const params = Object.fromEntries(parsed.searchParams.entries());

      switch (pathname) {
        case `/${URL_ACTIVATE_PATH}`:
        case '/': // Default path also triggers activation
          log.info('Activation request received:', params);
          wakeUpManager.activate({
            gatewayId: params.gw,
            siriInitiated: true,
          }).catch((err) => {
            log.error('URL scheme activation failed:', err);
          });
          break;

        default:
          log.warn('Unknown URL path:', pathname);
      }
    } catch (error) {
      log.error('Failed to handle URL:', url, error);
    }
  }
}

export const urlSchemeHandler = new UrlSchemeHandler();
