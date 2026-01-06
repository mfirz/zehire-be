/**
 * AWS SES Client for Cloudflare Workers
 * ======================================
 * A minimal, Workers-compatible AWS SES client using raw fetch and SigV4 signing.
 *
 * Why not use AWS SDK?
 * - AWS SDK v3 has Node.js dependencies incompatible with Workers
 * - We only need SendEmail action, so a minimal client is sufficient
 * - SigV4 signing is straightforward to implement
 *
 * References:
 * - AWS SigV4: https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 * - SES API: https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SesClientConfig {
  /** AWS Access Key ID */
  accessKeyId: string;
  /** AWS Secret Access Key */
  secretAccessKey: string;
  /** AWS Region (e.g., "us-east-1") */
  region: string;
}

export interface SendEmailParams {
  /** Sender email address */
  from: string;
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject: string;
  /** Plain text body */
  textBody?: string | undefined;
  /** HTML body */
  htmlBody?: string | undefined;
  /** Optional configuration set name */
  configurationSet?: string | undefined;
}

export interface SendEmailResult {
  /** SES Message ID */
  messageId: string;
}

/**
 * AWS SES error with code and status information.
 */
export class SesError extends Error {
  /** AWS error code */
  readonly code: string;
  /** HTTP status code */
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "SesError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// =============================================================================
// SES CLIENT CLASS
// =============================================================================

export class SesClient {
  private readonly endpoint: string;
  private readonly service = "ses";

  constructor(private readonly config: SesClientConfig) {
    this.endpoint = `https://email.${config.region}.amazonaws.com`;
  }

  /**
   * Send an email via AWS SES.
   *
   * @throws SesError if the request fails
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    // Build request body (URL-encoded form data)
    const body = this.buildSendEmailBody(params);

    // Create signed request
    const request = await this.createSignedRequest(body);

    // Execute request
    const response = await fetch(request);

    // Parse response
    if (!response.ok) {
      const errorText = await response.text();
      const error = this.parseErrorResponse(errorText, response.status);
      throw error;
    }

    const responseText = await response.text();
    const messageId = this.extractMessageId(responseText);

    return { messageId };
  }

  // ===========================================================================
  // REQUEST BUILDING
  // ===========================================================================

  /**
   * Build URL-encoded form body for SendEmail action.
   */
  private buildSendEmailBody(params: SendEmailParams): string {
    const formParams: Record<string, string> = {
      Action: "SendEmail",
      Version: "2010-12-01",
      Source: params.from,
      "Destination.ToAddresses.member.1": params.to,
      "Message.Subject.Data": params.subject,
      "Message.Subject.Charset": "UTF-8",
    };

    // Add text body if provided
    if (params.textBody) {
      formParams["Message.Body.Text.Data"] = params.textBody;
      formParams["Message.Body.Text.Charset"] = "UTF-8";
    }

    // Add HTML body if provided
    if (params.htmlBody) {
      formParams["Message.Body.Html.Data"] = params.htmlBody;
      formParams["Message.Body.Html.Charset"] = "UTF-8";
    }

    // Add configuration set if provided
    if (params.configurationSet) {
      formParams["ConfigurationSetName"] = params.configurationSet;
    }

    // URL-encode parameters
    return Object.entries(formParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
  }

  // ===========================================================================
  // AWS SIGV4 SIGNING
  // ===========================================================================

  /**
   * Create a signed request using AWS Signature Version 4.
   */
  private async createSignedRequest(body: string): Promise<Request> {
    const method = "POST";
    const url = new URL(this.endpoint);
    const host = url.host;

    // Get current time
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = this.formatDateStamp(now);

    // Create canonical request components
    const contentType = "application/x-www-form-urlencoded";
    const payloadHash = await this.sha256(body);

    // Headers to sign
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      Host: host,
      "X-Amz-Date": amzDate,
    };

    // Create canonical request
    const canonicalRequest = this.createCanonicalRequest(method, url, headers, payloadHash);

    // Create string to sign
    const credentialScope = `${dateStamp}/${this.config.region}/${this.service}/aws4_request`;
    const stringToSign = await this.createStringToSign(amzDate, credentialScope, canonicalRequest);

    // Calculate signature
    const signature = await this.calculateSignature(dateStamp, stringToSign);

    // Create authorization header
    const signedHeaders = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .join(";");

    const authorizationHeader =
      `AWS4-HMAC-SHA256 ` +
      `Credential=${this.config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;

    // Create request
    return new Request(this.endpoint, {
      method,
      headers: {
        ...headers,
        Authorization: authorizationHeader,
      },
      body,
    });
  }

  /**
   * Create the canonical request string.
   */
  private createCanonicalRequest(
    method: string,
    url: URL,
    headers: Record<string, string>,
    payloadHash: string
  ): string {
    const canonicalUri = url.pathname || "/";
    const canonicalQueryString = ""; // We use POST body, not query params

    // Sort headers by lowercase name
    const sortedHeaders = Object.entries(headers)
      .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
      .sort(([a], [b]) => a.localeCompare(b));

    const canonicalHeaders =
      sortedHeaders.map(([key, value]) => `${key}:${value}`).join("\n") + "\n";

    const signedHeaders = sortedHeaders.map(([key]) => key).join(";");

    return [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
  }

  /**
   * Create the string to sign.
   */
  private async createStringToSign(
    amzDate: string,
    credentialScope: string,
    canonicalRequest: string
  ): Promise<string> {
    const hashedRequest = await this.sha256(canonicalRequest);
    return ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedRequest].join("\n");
  }

  /**
   * Calculate the request signature.
   */
  private async calculateSignature(dateStamp: string, stringToSign: string): Promise<string> {
    // Derive signing key
    const kDate = await this.hmacSha256(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, this.config.region);
    const kService = await this.hmacSha256(kRegion, this.service);
    const kSigning = await this.hmacSha256(kService, "aws4_request");

    // Sign the string
    const signatureBytes = await this.hmacSha256(kSigning, stringToSign);
    return this.bytesToHex(signatureBytes);
  }

  // ===========================================================================
  // CRYPTO HELPERS (Web Crypto API)
  // ===========================================================================

  /**
   * Calculate SHA-256 hash and return as hex string.
   */
  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    return this.bytesToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Calculate HMAC-SHA256.
   */
  private async hmacSha256(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();

    // Convert key to ArrayBuffer if string
    const keyBuffer = typeof key === "string" ? encoder.encode(key) : key;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  }

  /**
   * Convert bytes to hexadecimal string.
   */
  private bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ===========================================================================
  // DATE FORMATTING
  // ===========================================================================

  /**
   * Format date as AWS X-Amz-Date (ISO 8601 basic format).
   * Example: 20230615T120000Z
   */
  private formatAmzDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  }

  /**
   * Format date stamp for credential scope.
   * Example: 20230615
   */
  private formatDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  // ===========================================================================
  // RESPONSE PARSING
  // ===========================================================================

  /**
   * Extract MessageId from successful response XML.
   */
  private extractMessageId(responseXml: string): string {
    // Simple regex extraction - XML parsing not needed for this
    const match = responseXml.match(/<MessageId>([^<]+)<\/MessageId>/);
    return match?.[1] ?? "unknown";
  }

  /**
   * Parse error response XML into SesError.
   */
  private parseErrorResponse(responseXml: string, statusCode: number): SesError {
    // Extract error code
    const codeMatch = responseXml.match(/<Code>([^<]+)<\/Code>/);
    const code = codeMatch?.[1] ?? "UnknownError";

    // Extract error message
    const messageMatch = responseXml.match(/<Message>([^<]+)<\/Message>/);
    const message = messageMatch?.[1] ?? "An unknown error occurred";

    return new SesError(code, message, statusCode);
  }
}
