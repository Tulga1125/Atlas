import { type NextRequest, NextResponse } from "next/server";
import {
  localeCookieName,
  locales,
  type Locale,
} from "@/modules/i18n/config";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  const requestedLocale = body?.locale;

  if (!locales.includes(requestedLocale as Locale)) {
    return Response.json({ error: "invalid_locale" }, { status: 400 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(localeCookieName, requestedLocale as Locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
