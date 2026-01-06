/**
 * Auth Module
 * ===========
 * Public exports for the authentication module.
 */

// Routes
export { createAuthRoutes } from "./auth.routes";

// Services
export { AuthService, UserRepository } from "./auth.service";
export { SessionService } from "./session.service";
export { TokenService } from "./token.service";

// Types
export type {
  AuthErrorCode,
  CallbackResult,
  LoginInput,
  LoginResult,
  MagicLinkTokenRow,
  SessionConfig,
  SessionPayload,
  TokenValidationResult,
  UserClaims,
  UserRole,
  UserRow,
} from "./auth.types";

export { AUTH_ERROR_CODES, USER_ROLES } from "./auth.types";
