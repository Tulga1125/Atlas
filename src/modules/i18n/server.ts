import "server-only";

import { cookies } from "next/headers";
import { localeCookieName, parseLocale } from "./config";

export async function getLocale() {
  const cookieStore = await cookies();
  return parseLocale(cookieStore.get(localeCookieName)?.value);
}
