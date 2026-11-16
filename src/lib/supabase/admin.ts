import { createClient } from "@supabase/supabase-js";
import { getDatabaseEnvironment } from "@/lib/env";
import type { Database } from "./database.types";

export function createAdminClient() {
  const environment = getDatabaseEnvironment();

  return createClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
