/**
 * Availability Module
 * ===================
 * Interviewer availability and blocked dates management.
 */

// Schemas
export {
  AvailabilityWindowSchema,
  UpdateAvailabilitySchema,
  BlockDateSchema,
  type AvailabilityWindow,
  type UpdateAvailabilityInput,
  type BlockDateInput,
  type BlockedDateResponse,
  type AvailabilityResponse,
} from "./schemas";

// Repository
export { AvailabilityRepository } from "./repository";

// Slot Calculation
export {
  calculateSlots,
  type TimeSlot,
  type InterviewerFreeBusy,
  type SlotCalculationOptions,
} from "./slots";
