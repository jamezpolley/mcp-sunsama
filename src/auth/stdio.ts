import { SunsamaClient } from "sunsama-api/client";
import { loginWithRetry } from "./retry.js";
import { curly } from "node-libcurl";

/**
 * Cached authentication promise to prevent concurrent auth attempts
 */
let authenticationPromise: Promise<SunsamaClient> | null = null;

/**
 * Log in via libcurl (avoids sec-fetch-* headers that Node fetch adds, which Sunsama's
 * server rejects on Linux). Returns the sunsamaSession cookie value.
 */
async function loginWithCurl(email: string, password: string): Promise<string> {
  const { statusCode, headers } = await curly.post(
    "https://api.sunsama.com/account/login/email",
    {
      postFields: new URLSearchParams({ email, password }).toString(),
      httpHeader: [
        "Content-Type: application/x-www-form-urlencoded",
        "Origin: https://app.sunsama.com",
      ],
      followLocation: false,
    },
  );

  if (statusCode !== 302) {
    throw new Error(`Sunsama login failed: ${statusCode}`);
  }

  const lastHeaders = headers[headers.length - 1] as Record<string, string | string[]>;
  const setCookie = lastHeaders["Set-Cookie"] ?? lastHeaders["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sessionCookie = cookies
    .map((c: string) => c.split(";")[0] ?? "")
    .find((c: string) => c.startsWith("sunsamaSession="));

  if (!sessionCookie) {
    throw new Error("Sunsama login succeeded but no sunsamaSession cookie was returned");
  }

  return sessionCookie.slice("sunsamaSession=".length);
}

/**
 * Initialize stdio authentication using environment variables
 * Supports session token (SUNSAMA_SESSION_TOKEN) or email/password (SUNSAMA_EMAIL, SUNSAMA_PASSWORD)
 * @throws {Error} If credentials are missing or authentication fails
 */
export async function initializeStdioAuth(): Promise<SunsamaClient> {
  // Prefer session token if available (useful for Google SSO users)
  if (process.env.SUNSAMA_SESSION_TOKEN) {
    const sunsamaClient = new SunsamaClient({
      sessionToken: process.env.SUNSAMA_SESSION_TOKEN
    });
    return sunsamaClient;
  }

  // Fall back to email/password authentication
  if (!process.env.SUNSAMA_EMAIL || !process.env.SUNSAMA_PASSWORD) {
    throw new Error(
      "Sunsama credentials not configured. Please set SUNSAMA_SESSION_TOKEN or both SUNSAMA_EMAIL and SUNSAMA_PASSWORD environment variables."
    );
  }

  // Use libcurl for login — Node's fetch adds sec-fetch-* headers that Sunsama rejects on Linux
  const sessionToken = await loginWithCurl(
    process.env.SUNSAMA_EMAIL,
    process.env.SUNSAMA_PASSWORD,
  );
  return new SunsamaClient({ sessionToken });
}

/**
 * Get the global Sunsama client instance for stdio transport
 * @returns {Promise<SunsamaClient>} The authenticated global client
 * @throws {Error} If credentials are missing or authentication fails
 */
export async function getGlobalSunsamaClient(): Promise<SunsamaClient> {
  if (!authenticationPromise) {
    authenticationPromise = initializeStdioAuth();
  }

  return authenticationPromise;
}