import { z } from "zod";
const schema = z.object({
  ATLAS_DEMO_MODE: z.literal("0").optional(),
  NEXT_PUBLIC_SUPABASE_URL: z
    .url()
    .refine((value) => new URL(value).protocol === "https:"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APPLE_MUSIC_DEVELOPER_TOKEN: z.string().min(20),
  CRON_SECRET: z.string().min(32),
  NEXT_PUBLIC_SITE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)
    );
  }),
});
export function validateProductionEnvironment(
  environment: Record<string, string | undefined>,
) {
  const result = schema.safeParse(environment);
  if (!result.success)
    throw new Error(
      `Invalid production configuration: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(", ")}`,
    );
  try {
    const claims = z
      .object({ exp: z.number(), iss: z.string().min(1) })
      .parse(
        JSON.parse(
          Buffer.from(
            result.data.APPLE_MUSIC_DEVELOPER_TOKEN.split(".")[1],
            "base64url",
          ).toString(),
        ),
      );
    if (claims.exp * 1000 <= Date.now()) throw new Error("expired");
  } catch {
    throw new Error(
      "Invalid production configuration: APPLE_MUSIC_DEVELOPER_TOKEN",
    );
  }
  return result.data;
}
