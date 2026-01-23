/**
 * Video Module
 * ============
 * Provider-agnostic video call integration for interview scheduling.
 */

// Types
export type {
  VideoProviderType,
  VideoCallProvider,
  VideoTokens,
  VideoMeetingInput,
  VideoMeeting,
  ZoomEnv,
} from "./types";

// Factory
export { createVideoProvider, type VideoProviderTypeWithNative } from "./factory";

// Providers
export { ZoomProvider } from "./providers/zoom";
export { CalendarNativeProvider } from "./providers/calendar-native";

// Service
export { VideoCallService } from "./service";
