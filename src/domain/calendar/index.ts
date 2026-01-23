/**
 * Calendar Module
 * ===============
 * Provider-agnostic calendar integration for interview scheduling.
 */

// Types
export type {
  CalendarProviderType,
  CalendarProvider,
  CalendarTokens,
  BusyPeriod,
  CalendarEventInput,
  CalendarEvent,
  OAuthConfig,
  GoogleCalendarEnv,
  OutlookCalendarEnv,
} from "./types";

// Factory
export { createCalendarProvider } from "./factory";

// Providers
export { GoogleCalendarProvider } from "./providers/google";

// Service
export { CalendarService } from "./service";
