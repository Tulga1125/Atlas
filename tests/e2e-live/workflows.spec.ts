import { expect, test, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (new URL(url).port !== "55321")
  throw new Error("Live browser tests require the isolated database");
const db = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
async function signIn(context: BrowserContext, role: string) {
  const auth = createServerClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: async (cookies) => {
          await context.addCookies(
            cookies.map((c) => ({
              name: c.name,
              value: c.value,
              url: "http://127.0.0.1:3101",
              httpOnly: c.options.httpOnly ?? false,
              secure: false,
              sameSite: "Lax" as const,
            })),
          );
        },
      },
    },
  );
  const result = await auth.auth.signInWithPassword({
    email: `${role}@atlas.example`,
    password: "Atlas-fixture-password-2026!",
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}
test("real authentication protects every staff section and private service endpoint", async ({
  page,
  request,
}) => {
  for (const route of [
    "/dashboard/data-health",
    "/dashboard/catalog",
    "/dashboard/newsroom",
    "/dashboard/artists",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\?/);
  }
  expect((await request.post("/api/internal/worker")).status()).toBe(401);
  expect((await request.get("/api/internal/jobs")).status()).toBe(403);
  expect((await request.get("/api/internal/data-health")).status()).toBe(403);
});
test("an editor publishes a Mongolian article through verified, assigned, draft and approved states", async ({
  page,
  context,
}, info) => {
  const user = await signIn(context, "editor");
  const created = await db
    .from("story_leads")
    .insert({
      headline: `Browser ${info.project.name} ${Date.now()}`,
      angle: "Verified fixture chart evidence",
      supporting_facts: [{ source: "Local test fixture", rank: 1 }],
    })
    .select("id")
    .single();
  expect(created.error).toBeNull();
  const storyId = created.data!.id;
  await page.goto(`/dashboard/newsroom/${storyId}`);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await page.getByLabel("Assignee", { exact: true }).selectOption(user.id);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page.getByLabel("Mongolian headline", { exact: true }),
  ).toBeVisible();
  const headline = `Браузерын нийтлэл ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Mongolian headline", { exact: true }).fill(headline);
  await page
    .getByLabel("Mongolian article", { exact: true })
    .fill("Энэ нь орон нутгийн туршилтын нотолгоотой нийтлэл юм.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submit for editing", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for editing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  const publication = await db
    .from("publications")
    .select("id")
    .eq("story_id", storyId)
    .eq("channel", "atlas")
    .single();
  expect(publication.error).toBeNull();
  await context.clearCookies();
  await page.goto(`/news/${publication.data!.id}`);
  await expect(
    page.getByRole("heading", { name: headline, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Монгол", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "mn");
  await expect(
    page.getByRole("heading", { name: headline, exact: true }),
  ).toBeVisible();
});
test("live charts, off-chart song history and bilingual staff navigation render without overflow", async ({
  page,
  context,
  request,
}) => {
  const chart = await request.get("/api/v1/charts/apple-music-mongolia/latest");
  expect(chart.status()).toBe(200);
  const json = await chart.json();
  expect(json.data.snapshot.isDemo).toBe(false);
  expect(json.data.entries).toHaveLength(100);
  const health = await request.get("/api/internal/data-health", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(health.status()).toBe(200);
  const song = await db
    .from("platform_assets")
    .select("recording_id")
    .eq("platform_item_id", "new-fixture-song")
    .single();
  expect(song.error).toBeNull();
  const recording = await db
    .from("recordings")
    .select("song_id")
    .eq("id", song.data!.recording_id!)
    .single();
  expect(recording.error).toBeNull();
  await page.goto(`/songs/${recording.data!.song_id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const route of [
    "/",
    "/charts/apple-music-mongolia/archive",
    "/charts/apple-music-mongolia/weekly",
    "/search?q=Fixture",
  ]) {
    await page.goto(route);
    expect(
      await page
        .locator("body")
        .evaluate((el) => el.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
  await signIn(context, "administrator");
  for (const locale of ["en", "mn"]) {
    await context.request.post("/api/language", { data: { locale } });
    for (const section of [
      "charts",
      "signals",
      "anomalies",
      "catalog",
      "newsroom",
      "data-health",
      "artists",
    ]) {
      await page.goto(`/dashboard/${section}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  }
});

test("an invited account follows a delivered magic link and public registration stays disabled", async ({
  page,
  request,
}, info) => {
  const email = `mail-${info.project.name}-${Date.now()}@atlas.example`;
  const created = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: "Mail fixture" },
  });
  expect(created.error).toBeNull();
  await db
    .from("profiles")
    .update({ active: true, role: "analyst" })
    .eq("id", created.data.user!.id);
  await page.goto("/login");
  await page.getByRole("textbox").fill(email);
  await page.getByRole("button", { name: /send.*link/i }).click();
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await request.get(
        "http://127.0.0.1:54324/api/v1/messages",
      );
      const body = await response.json();
      const message = body.messages?.find(
        (m: { To: Array<{ Address: string }> }) =>
          m.To.some((t) => t.Address === email),
      );
      messageId = message?.ID ?? "";
      return !!messageId;
    })
    .toBe(true);
  const message = await (
    await request.get(`http://127.0.0.1:54324/api/v1/message/${messageId}`)
  ).json();
  const link = String(message.HTML)
    .match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]
    .replaceAll("&amp;", "&");
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const outsider = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const signup = await outsider.auth.signUp({
    email: `outsider-${Date.now()}@atlas.example`,
    password: "Not-a-production-password-2026!",
  });
  expect(signup.error?.code).toBe("signup_disabled");
});

test("an administrator previews, applies and undoes a catalog merge", async ({
  page,
  context,
}, info) => {
  await signIn(context, "administrator");
  const { data: artist, error: artistError } = await db
    .from("artists")
    .select("id")
    .eq("source_key", "apple_music:123456789")
    .single();
  expect(artistError).toBeNull();
  const title = `Catalog ${info.project.name} ${Date.now()}`;
  const source = await db
    .from("songs")
    .insert({
      canonical_title: title,
      normalized_title: title.toLowerCase(),
      primary_artist_id: artist!.id,
    })
    .select("id")
    .single();
  expect(source.error).toBeNull();
  const target = await db
    .from("songs")
    .insert({
      canonical_title: `${title} destination`,
      normalized_title: `${title.toLowerCase()} destination`,
      primary_artist_id: artist!.id,
    })
    .select("id")
    .single();
  expect(target.error).toBeNull();
  const recording = await db
    .from("recordings")
    .insert({ song_id: source.data!.id, recording_type: "original" });
  expect(recording.error).toBeNull();
  await page.goto(`/dashboard/catalog/${source.data!.id}`);
  await page
    .getByLabel("Destination song", { exact: true })
    .selectOption(target.data!.id);
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Preview impact", exact: true }),
    });
  await form
    .getByLabel("Review reason and evidence", { exact: true })
    .fill("Browser verified duplicate source identity");
  await page
    .getByRole("button", { name: "Preview impact", exact: true })
    .click();
  await expect(page.getByText(/1 recordings, 0 chart entries/)).toBeVisible();
  await expect(
    page.getByLabel("Destination song", { exact: true }),
  ).toHaveValue(target.data!.id);
  await page
    .getByRole("button", { name: "Apply reviewed change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo catalog change", exact: true }),
  ).toBeVisible();
  expect(
    (
      await db
        .from("songs")
        .select("redirect_to")
        .eq("id", source.data!.id)
        .single()
    ).data?.redirect_to,
  ).toBe(target.data!.id);
  const undo = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "Undo catalog change",
        exact: true,
      }),
    });
  await undo
    .getByLabel("Review reason and evidence", { exact: true })
    .fill("Browser restore reviewed original identity");
  await undo
    .getByRole("button", { name: "Undo catalog change", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("songs")
            .select("redirect_to")
            .eq("id", source.data!.id)
            .single()
        ).data?.redirect_to,
    )
    .toBeNull();
});

test("a data editor links a discovered YouTube video to a song", async ({
  page,
  context,
}, info) => {
  const editor = await signIn(context, "data_editor");
  const stamp = `${info.project.name}${Date.now()}`.replace(/[^A-Za-z0-9]/g, "");
  const videoId = stamp.slice(-11).padStart(11, "x");
  const { data: artist, error: artistError } = await db
    .from("artists")
    .select("id")
    .eq("source_key", "apple_music:123456789")
    .single();
  expect(artistError).toBeNull();
  const title = `YouTube link ${stamp}`;
  const song = await db
    .from("songs")
    .insert({
      canonical_title: title,
      normalized_title: title.toLowerCase(),
      primary_artist_id: artist!.id,
    })
    .select("id")
    .single();
  expect(song.error).toBeNull();
  const recording = await db
    .from("recordings")
    .insert({ song_id: song.data!.id, recording_type: "original" })
    .select("id")
    .single();
  expect(recording.error).toBeNull();
  // A fixture candidate from an unverified channel: never auto-linked.
  const added = await db.rpc("record_manual_youtube_video", {
    p_actor: editor.id,
    p_reason: "Fixture candidate for the browser test",
    p_source_url: `https://www.googleapis.com/youtube/v3/videos?id=${videoId}`,
    p_http_status: 200,
    p_raw_body: "{}",
    p_checksum: `fixture-${stamp}`,
    p_video: {
      videoId,
      channelId: "UCfixturechannel00000001",
      channelTitle: "Fixture uploads",
      title: `${title} (Official MV)`,
      durationSeconds: 201,
      suggestedKind: "other",
    },
  });
  expect(added.error).toBeNull();
  const assetId = (added.data as { assetId: string }).assetId;

  await page.goto("/dashboard/catalog/youtube");
  const card = page.locator(`article[data-video-id="${videoId}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Unverified channel")).toBeVisible();
  const form = card.locator("form").first();
  await form.getByLabel("Action", { exact: true }).selectOption("link");
  await form
    .getByLabel("Song recording", { exact: true })
    .selectOption(recording.data!.id);
  await form
    .getByLabel("Kind", { exact: true })
    .selectOption("official_music_video");
  await form
    .getByLabel("Review reason and evidence", { exact: true })
    .fill("Label confirmed this is the official video");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByText("Saved.")).toBeVisible();

  const linked = await db
    .from("youtube_video_assets")
    .select("link_status,verification,asset_kind")
    .eq("platform_asset_id", assetId)
    .single();
  expect(linked.data).toEqual({
    link_status: "linked",
    verification: "verified",
    asset_kind: "official_music_video",
  });
  const asset = await db
    .from("platform_assets")
    .select("recording_id")
    .eq("id", assetId)
    .single();
  expect(asset.data?.recording_id).toBe(recording.data!.id);
  const audit = await db
    .from("audit_logs")
    .select("actor_user_id,reason")
    .eq("action", "youtube_video.link")
    .eq("entity_id", assetId)
    .single();
  expect(audit.data).toEqual({
    actor_user_id: editor.id,
    reason: "Label confirmed this is the official video",
  });
});

test("an editor tags a chart song and a data editor verifies it, in both locales", async ({
  page,
  context,
}) => {
  await signIn(context, "editor");
  const { data: entry, error } = await db
    .from("chart_facts")
    .select("song_id,title")
    .order("snapshot_date", { ascending: false })
    .order("rank")
    .limit(1)
    .single();
  expect(error).toBeNull();
  const { data: love } = await db
    .from("context_terms")
    .select("id")
    .eq("dimension", "theme")
    .eq("slug", "love")
    .single();

  for (const [locale, title, suggest] of [
    ["en", "Music context tagging", "Suggest tag"],
    ["mn", "Хөгжмийн агуулгын шошго", "Шошго санал болгох"],
  ] as const) {
    await context.request.post("/api/language", { data: { locale } });
    await page.goto("/dashboard/catalog/tags");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("button", { name: suggest }).first()).toBeVisible();
  }

  await context.request.post("/api/language", { data: { locale: "en" } });
  await page.goto("/dashboard/catalog/tags");
  const card = page.locator(`article[data-song-id="${entry!.song_id}"]`);
  await card.getByLabel("Tag", { exact: true }).selectOption(`${love!.id}|theme`);
  await card
    .getByLabel("Evidence note in your own words", { exact: true })
    .fill("Listened: addressed to a partner throughout");
  await card.getByRole("button", { name: "Suggest tag" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await context.clearCookies();
  await signIn(context, "data_editor");
  await page.goto("/dashboard/catalog/tags");
  const { data: tag } = await db
    .from("song_context_tags")
    .select("id")
    .eq("song_id", entry!.song_id!)
    .eq("term_id", love!.id)
    .single();
  await page.locator(`input[name="tags"][value="${tag!.id}"]`).check();
  await page.getByLabel("Decision", { exact: true }).first().selectOption("verify");
  const review = page.locator("form").filter({ has: page.getByRole("button", { name: "Save decision" }) });
  await review.getByLabel("Review reason and evidence").fill("Listened to the full song myself");
  await review.getByRole("button", { name: "Save decision" }).click();
  await expect(review.getByText("Saved.")).toBeVisible();

  const verified = await db.from("song_context_tags").select("status").eq("id", tag!.id).single();
  expect(verified.data?.status).toBe("verified");
});
