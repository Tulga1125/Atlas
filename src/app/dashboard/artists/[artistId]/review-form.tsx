"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import {
  artistEvidenceTypes,
  artistLocalities,
  artistTypes,
  artistVerificationStatuses,
  type ReviewArtist,
} from "@/modules/artist-review/types";
import type { Locale } from "@/modules/i18n/config";
import { getDictionary } from "@/modules/i18n/dictionaries";
import {
  reviewArtistIdentity,
  type ArtistReviewActionState,
} from "../actions";

const initialState: ArtistReviewActionState = { status: "idle" };

type ArtistReviewFormProps = {
  artist: ReviewArtist;
  canEdit: boolean;
  locale: Locale;
};

export function ArtistReviewForm({
  artist,
  canEdit,
  locale,
}: ArtistReviewFormProps) {
  const dictionary = getDictionary(locale).artistReview;
  const [state, formAction, pending] = useActionState(
    reviewArtistIdentity,
    initialState,
  );
  const youtubeProfile = artist.profiles.find(
    (profile) => profile.platformCode === "youtube",
  );
  const disabled = !canEdit || pending || state.status === "success";
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="artist-review-form">
      <input name="artistId" type="hidden" value={artist.id} />

      <section className="artist-review-form__section">
        <header>
          <span>01</span>
          <div>
            <h2>{dictionary.identitySection}</h2>
            <p>{dictionary.identityHelp}</p>
          </div>
        </header>
        <div className="artist-review-form__grid">
          <label className="artist-review-form__wide">
            <span>{dictionary.canonicalName}</span>
            <input
              defaultValue={artist.canonicalName}
              disabled={disabled}
              maxLength={160}
              name="canonicalName"
              required
            />
            {fieldError("canonicalName") && <small>{fieldError("canonicalName")}</small>}
          </label>
          <label>
            <span>{dictionary.artistType}</span>
            <select defaultValue={artist.artistType} disabled={disabled} name="artistType">
              {artistTypes.map((type) => (
                <option key={type} value={type}>{dictionary.artistTypes[type]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{dictionary.countryCode}</span>
            <input
              defaultValue={artist.countryCode ?? ""}
              disabled={disabled}
              maxLength={2}
              name="countryCode"
              placeholder="MN"
            />
            {fieldError("countryCode") && <small>{fieldError("countryCode")}</small>}
          </label>
          <label>
            <span>{dictionary.locality}</span>
            <select defaultValue={artist.locality} disabled={disabled} name="locality">
              {artistLocalities.map((locality) => (
                <option key={locality} value={locality}>{dictionary.localities[locality]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{dictionary.verification}</span>
            <select defaultValue={artist.verification} disabled={disabled} name="verification">
              {artistVerificationStatuses.map((status) => (
                <option key={status} value={status}>{dictionary.statuses[status]}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="artist-review-form__section">
        <header>
          <span>02</span>
          <div>
            <h2>{dictionary.evidenceSection}</h2>
            <p>{dictionary.evidenceHelp}</p>
          </div>
        </header>
        <div className="artist-review-form__grid">
          <label>
            <span>{dictionary.evidenceType}</span>
            <select defaultValue="" disabled={disabled} name="evidenceType">
              <option value="">{dictionary.noNewEvidence}</option>
              {artistEvidenceTypes.map((type) => (
                <option key={type} value={type}>{dictionary.evidenceTypes[type]}</option>
              ))}
            </select>
          </label>
          <label className="artist-review-form__wide">
            <span>{dictionary.evidenceUrl}</span>
            <input
              disabled={disabled}
              name="evidenceUrl"
              placeholder="https://"
              type="url"
            />
            {fieldError("evidenceUrl") && <small>{fieldError("evidenceUrl")}</small>}
          </label>
          <label className="artist-review-form__full">
            <span>{dictionary.reviewNotes}</span>
            <textarea disabled={disabled} maxLength={1000} name="evidenceNotes" rows={4} />
            {fieldError("evidenceNotes") && <small>{fieldError("evidenceNotes")}</small>}
          </label>
        </div>
      </section>

      <section className="artist-review-form__section">
        <header>
          <span>03</span>
          <div>
            <h2>{dictionary.youtubeSection}</h2>
            <p>{dictionary.youtubeHelp}</p>
          </div>
        </header>
        <div className="artist-review-form__grid">
          <label>
            <span>{dictionary.youtubeChannelId}</span>
            <input
              defaultValue={youtubeProfile?.platformArtistId ?? ""}
              disabled={disabled}
              maxLength={24}
              name="youtubeChannelId"
              placeholder="UC…"
            />
            {fieldError("youtubeChannelId") && <small>{fieldError("youtubeChannelId")}</small>}
          </label>
          <label className="artist-review-form__wide">
            <span>{dictionary.youtubeProfileUrl}</span>
            <input
              defaultValue={youtubeProfile?.profileUrl ?? ""}
              disabled={disabled}
              name="youtubeProfileUrl"
              placeholder="https://www.youtube.com/channel/…"
              type="url"
            />
            {fieldError("youtubeProfileUrl") && <small>{fieldError("youtubeProfileUrl")}</small>}
          </label>
        </div>
      </section>

      <footer className="artist-review-form__footer">
        <p
          aria-live="polite"
          className={state.status === "error" ? "artist-review-form__error" : ""}
        >
          {state.message ?? (!canEdit ? dictionary.readOnlyRole : dictionary.saveHelp)}
        </p>
        <button disabled={disabled} type="submit">
          <Save aria-hidden="true" size={16} />
          {pending
            ? dictionary.saving
            : state.status === "success"
              ? dictionary.saved
              : dictionary.saveReview}
        </button>
      </footer>
    </form>
  );
}
