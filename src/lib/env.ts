// env.ts
// Fails fast and loudly at startup when required environment configuration
// is missing or malformed, instead of letting the app boot and only
// discovering the problem as a CONFIG_MISSING error on the first API call a
// user happens to trigger. Side-effect import only — see layout.tsx.

function validateApiBaseUrl(): void {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Add it to .env.local (or this " +
        "deployment's environment variables) — nothing in the app can reach " +
        "the backend without it.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL is not a valid URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL must use http or https, got "${parsed.protocol}" ("${url}")`,
    );
  }
}

validateApiBaseUrl();
