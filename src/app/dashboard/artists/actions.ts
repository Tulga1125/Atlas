"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  artistEvidenceTypes,
  artistLocalities,
  artistTypes,
  artistVerificationStatuses,
} from "@/modules/artist-review/types";
import { getDictionary } from "@/modules/i18n/dictionaries";
import { getLocale } from "@/modules/i18n/server";

export type ArtistReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const optionalUrl = z.union([z.literal(""), z.httpUrl().max(2_048)]);
const reviewFormSchema = z
  .object({
    artistId: z.uuid(),
    canonicalName: z.string().trim().min(1).max(160),
    artistType: z.enum(artistTypes),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z]{2}$/.test(value)),
    locality: z.enum(artistLocalities),
    verification: z.enum(artistVerificationStatuses),
    evidenceType: z.union([z.literal(""), z.enum(artistEvidenceTypes)]),
    evidenceUrl: optionalUrl,
    evidenceNotes: z.string().trim().max(1_000),
    youtubeChannelId: z
      .string()
      .trim()
      .refine((value) => value === "" || /^UC[A-Za-z0-9_-]{22}$/.test(value)),
    youtubeProfileUrl: optionalUrl,
  })
  .superRefine((value, context) => {
    if (value.evidenceType && !value.evidenceUrl && !value.evidenceNotes) {
      context.addIssue({
        code: "custom",
        path: ["evidenceNotes"],
        message: "Evidence needs a URL or review notes.",
      });
    }

    if (value.youtubeProfileUrl && !value.youtubeChannelId) {
      context.addIssue({
        code: "custom",
        path: ["youtubeChannelId"],
        message: "Add the channel ID before its profile URL.",
      });
    }
  });

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeDatabaseMessage(message: string, locale: "en" | "mn") {
  const dictionary = getDictionary(locale).artistReview;

  if (message.includes("verification evidence")) {
    return dictionary.errors.evidenceRequired;
  }
  if (message.includes("country code MN")) {
    return dictionary.errors.localCountry;
  }
  if (message.includes("already linked to another artist")) {
    return dictionary.errors.youtubeConflict;
  }
  if (message.includes("administrator or data_editor")) {
    return dictionary.errors.forbidden;
  }
  if (message.includes("artist not found")) {
    return dictionary.errors.notFound;
  }

  return dictionary.errors.saveFailed;
}

export async function reviewArtistIdentity(
  _previousState: ArtistReviewActionState,
  formData: FormData,
): Promise<ArtistReviewActionState> {
  const locale = await getLocale();
  const dictionary = getDictionary(locale).artistReview;

  const parsed = reviewFormSchema.safeParse({
    artistId: formValue(formData, "artistId"),
    canonicalName: formValue(formData, "canonicalName"),
    artistType: formValue(formData, "artistType"),
    countryCode: formValue(formData, "countryCode"),
    locality: formValue(formData, "locality"),
    verification: formValue(formData, "verification"),
    evidenceType: formValue(formData, "evidenceType"),
    evidenceUrl: formValue(formData, "evidenceUrl"),
    evidenceNotes: formValue(formData, "evidenceNotes"),
    youtubeChannelId: formValue(formData, "youtubeChannelId"),
    youtubeProfileUrl: formValue(formData, "youtubeProfileUrl"),
  });

  if (!parsed.success) {
    const invalidFields = Object.fromEntries(
      Object.keys(parsed.error.flatten().fieldErrors).map((field) => [
        field,
        [dictionary.errors.invalidField],
      ]),
    );

    return {
      status: "error",
      message: dictionary.errors.validation,
      fieldErrors: invalidFields,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const subject = claimsData?.claims?.sub;

  if (typeof subject !== "string") {
    return { status: "error", message: dictionary.errors.unauthenticated };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", subject)
    .maybeSingle();

  if (
    profileError ||
    !profile?.active ||
    !["administrator", "data_editor"].includes(profile.role)
  ) {
    return { status: "error", message: dictionary.errors.forbidden };
  }

  const input = parsed.data;
  const { error } = await supabase.rpc("review_artist_identity", {
    p_artist_id: input.artistId,
    p_canonical_name: input.canonicalName,
    p_artist_type: input.artistType,
    p_country_code: input.countryCode || "",
    p_locality: input.locality,
    p_verification: input.verification,
    p_evidence_type: input.evidenceType || undefined,
    p_evidence_url: input.evidenceUrl || undefined,
    p_evidence_notes: input.evidenceNotes || undefined,
    p_youtube_channel_id: input.youtubeChannelId || undefined,
    p_youtube_profile_url: input.youtubeProfileUrl || undefined,
  });

  if (error) {
    console.error("Atlas artist review failed", error.message);
    return {
      status: "error",
      message: safeDatabaseMessage(error.message, locale),
    };
  }

  updateTag("atlas-charts");
  revalidatePath("/dashboard/artists");
  revalidatePath(`/dashboard/artists/${input.artistId}`);
  revalidatePath("/artists");
  revalidatePath(`/artists/${input.artistId}`);

  return { status: "success", message: dictionary.saved };
}
