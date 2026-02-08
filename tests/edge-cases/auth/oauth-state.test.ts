/**
 * Edge-case tests for OAuth state HMAC signing
 * Tests: createSignedState, verifySignedState integrity and tamper detection
 */
import { describe, it, expect } from "vitest";
import { createSignedState, verifySignedState } from "../../../src/lib/crypto";

const TEST_SECRET = "test-secret-key-for-hmac-signing-32ch";

describe("OAuth State Signing", () => {
  // ---------------------------------------------------------------------------
  // ROUND-TRIP
  // ---------------------------------------------------------------------------

  describe("createSignedState + verifySignedState", () => {
    it("round-trips a valid state payload", async () => {
      const payload = { returnUrl: "/dashboard", provider: "google", nonce: "abc-123" };
      const state = await createSignedState(payload, TEST_SECRET);
      const result = await verifySignedState<typeof payload>(state, TEST_SECRET);

      expect(result).toEqual(payload);
    });

    it("preserves all payload fields", async () => {
      const payload = { token: "magic-token-xyz", provider: "google" };
      const state = await createSignedState(payload, TEST_SECRET);
      const result = await verifySignedState<typeof payload>(state, TEST_SECRET);

      expect(result).toEqual(payload);
      expect(result!.token).toBe("magic-token-xyz");
      expect(result!.provider).toBe("google");
    });

    it("handles empty object payload", async () => {
      const state = await createSignedState({}, TEST_SECRET);
      const result = await verifySignedState(state, TEST_SECRET);

      expect(result).toEqual({});
    });

    it("handles payload with special characters", async () => {
      const payload = { returnUrl: "/path?foo=bar&baz=qux", name: "O'Brien" };
      const state = await createSignedState(payload, TEST_SECRET);
      const result = await verifySignedState<typeof payload>(state, TEST_SECRET);

      expect(result).toEqual(payload);
    });
  });

  // ---------------------------------------------------------------------------
  // TAMPER DETECTION
  // ---------------------------------------------------------------------------

  describe("tamper detection", () => {
    it("rejects state signed with a different secret", async () => {
      const payload = { returnUrl: "/", provider: "google" };
      const state = await createSignedState(payload, TEST_SECRET);
      const result = await verifySignedState(state, "wrong-secret-key-different-from-original");

      expect(result).toBeNull();
    });

    it("rejects state with tampered payload", async () => {
      const payload = { returnUrl: "/", provider: "google" };
      const state = await createSignedState(payload, TEST_SECRET);

      // Decode, modify payload, re-encode without re-signing
      const decoded = JSON.parse(atob(state)) as { p: string; s: string };
      const tamperedPayload = JSON.stringify({ returnUrl: "https://evil.com", provider: "google" });
      const tampered = btoa(JSON.stringify({ p: tamperedPayload, s: decoded.s }));

      const result = await verifySignedState(tampered, TEST_SECRET);
      expect(result).toBeNull();
    });

    it("rejects state with tampered signature", async () => {
      const payload = { returnUrl: "/", provider: "google" };
      const state = await createSignedState(payload, TEST_SECRET);

      // Decode, modify signature, re-encode
      const decoded = JSON.parse(atob(state)) as { p: string; s: string };
      const tampered = btoa(JSON.stringify({ p: decoded.p, s: "tampered-signature" }));

      const result = await verifySignedState(tampered, TEST_SECRET);
      expect(result).toBeNull();
    });

    it("rejects forged state (attacker crafts entire state)", async () => {
      const forgedPayload = JSON.stringify({
        returnUrl: "https://evil.com/steal",
        provider: "google",
        nonce: "forged-nonce",
      });
      const forgedState = btoa(JSON.stringify({ p: forgedPayload, s: "fake-sig" }));

      const result = await verifySignedState(forgedState, TEST_SECRET);
      expect(result).toBeNull();
    });

    it("rejects plain base64-encoded state (no signature)", async () => {
      // This is the old format — just btoa(JSON.stringify(payload))
      const oldFormatState = btoa(
        JSON.stringify({ returnUrl: "/", provider: "google", nonce: "test" })
      );

      const result = await verifySignedState(oldFormatState, TEST_SECRET);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // INVALID INPUT
  // ---------------------------------------------------------------------------

  describe("invalid input", () => {
    it("returns null for empty string", async () => {
      const result = await verifySignedState("", TEST_SECRET);
      expect(result).toBeNull();
    });

    it("returns null for invalid base64", async () => {
      const result = await verifySignedState("not-valid-base64!!!", TEST_SECRET);
      expect(result).toBeNull();
    });

    it("returns null for valid base64 but invalid JSON", async () => {
      const result = await verifySignedState(btoa("not json"), TEST_SECRET);
      expect(result).toBeNull();
    });

    it("returns null for missing payload field", async () => {
      const result = await verifySignedState(btoa(JSON.stringify({ s: "sig" })), TEST_SECRET);
      expect(result).toBeNull();
    });

    it("returns null for missing signature field", async () => {
      const result = await verifySignedState(
        btoa(JSON.stringify({ p: '{"foo":"bar"}' })),
        TEST_SECRET,
      );
      expect(result).toBeNull();
    });
  });
});
