import { z } from "zod";

const publicDataEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const databaseEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APPLE_MUSIC_DEVELOPER_TOKEN: z.string().min(20),
  CRON_SECRET: z.string().min(16),
});

const artistCollectorEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(16),
  APPLE_MUSIC_DEVELOPER_TOKEN: z.string().min(20).optional(),
  YOUTUBE_API_KEY: z.string().min(20).optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type ArtistCollectorEnvironment = z.infer<
  typeof artistCollectorEnvironmentSchema
>;

function publicDataEnvironmentInput() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function databaseEnvironmentInput() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function collectorEnvironmentInput() {
  return {
    ...databaseEnvironmentInput(),
    APPLE_MUSIC_DEVELOPER_TOKEN:
      process.env.APPLE_MUSIC_DEVELOPER_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
  };
}

function artistCollectorEnvironmentInput() {
  return {
    ...databaseEnvironmentInput(),
    CRON_SECRET: process.env.CRON_SECRET,
    APPLE_MUSIC_DEVELOPER_TOKEN:
      process.env.APPLE_MUSIC_DEVELOPER_TOKEN || undefined,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || undefined,
  };
}

function missingKeys(
  result: z.ZodSafeParseResult<unknown>,
): string[] {
  if (result.success) {
    return [];
  }

  return [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}

export function getPublicDataEnvironment() {
  return publicDataEnvironmentSchema.parse(publicDataEnvironmentInput());
}

export function getDatabaseEnvironment() {
  return databaseEnvironmentSchema.parse(databaseEnvironmentInput());
}

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse(collectorEnvironmentInput());
}

export function getArtistCollectorEnvironment(): ArtistCollectorEnvironment {
  return artistCollectorEnvironmentSchema.parse(
    artistCollectorEnvironmentInput(),
  );
}

export function getMissingPublicDataConfiguration(): string[] {
  return missingKeys(
    publicDataEnvironmentSchema.safeParse(publicDataEnvironmentInput()),
  );
}

export function getMissingCollectorConfiguration(): string[] {
  return missingKeys(
    serverEnvironmentSchema.safeParse(collectorEnvironmentInput()),
  );
}

export function getMissingArtistCollectorConfiguration(): string[] {
  return missingKeys(
    artistCollectorEnvironmentSchema.safeParse(
      artistCollectorEnvironmentInput(),
    ),
  );
}

const aiEnvironmentSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  ATLAS_AI_MODEL: z.string().min(1).default("claude-haiku-5-5"),
});

/** Optional AI settings (D8, D10). Server-only: never import into client code. */
export function getAiEnvironment() {
  return aiEnvironmentSchema.parse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    ATLAS_AI_MODEL: process.env.ATLAS_AI_MODEL || undefined,
  });
}
