import { Nango } from '@nangohq/node';

const DEFAULT_NANGO_HOST = 'https://api.nango.dev';

let nangoClient: Nango | null = null;

export function getNangoPublicKey(): string | undefined {
  return process.env.NANGO_PUBLIC_KEY?.trim();
}

export function isNangoConfigured(): boolean {
  const secretKey = process.env.NANGO_SECRET_KEY?.trim() ?? process.env.NANGO_API_KEY?.trim();
  const publicKey = getNangoPublicKey();
  return Boolean(secretKey && publicKey);
}

export function getNangoHost(): string {
  return process.env.NANGO_HOST?.trim() || DEFAULT_NANGO_HOST;
}

/** Returns a singleton Nango SDK client. Throws when credentials are missing. */
export function getNangoClient(): Nango {
  if (nangoClient) {
    return nangoClient;
  }

  const secretKey = process.env.NANGO_SECRET_KEY?.trim() ?? process.env.NANGO_API_KEY?.trim();
  if (!secretKey) {
    throw new Error('NANGO_SECRET_KEY is not configured');
  }

  nangoClient = new Nango({
    secretKey,
    host: getNangoHost(),
  });

  return nangoClient;
}

/** Resets the cached client — for tests only. */
export function resetNangoClientForTests(): void {
  nangoClient = null;
}

export type NangoClient = Nango;
