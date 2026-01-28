/**
 * SSO Module Exports
 * ==================
 * Central export point for SSO authentication.
 */

// Types
export type {
  SSOProvider,
  SSOProviderType,
  SSOProviderConfig,
  SSOLoginResult,
  SSOLoginError,
} from "./types";

// Factory
export {
  createSSOProvider,
  isSupportedSSOProvider,
  SUPPORTED_SSO_PROVIDERS,
} from "./factory";

// Providers (for direct usage if needed)
export { GoogleSSOProvider } from "./providers/google";
