export const artistTypes = ["person", "group", "band", "project"] as const;
export const artistLocalities = [
  "unknown",
  "local",
  "international",
  "mixed",
] as const;
export const artistVerificationStatuses = [
  "unverified",
  "suggested",
  "verified",
  "disputed",
] as const;
export const artistEvidenceTypes = [
  "official_profile",
  "musicbrainz",
  "wikidata",
  "label",
  "press",
  "artist_claim",
  "manual",
] as const;

export type ArtistType = (typeof artistTypes)[number];
export type ArtistLocality = (typeof artistLocalities)[number];
export type ArtistVerificationStatus =
  (typeof artistVerificationStatuses)[number];
export type ArtistEvidenceType = (typeof artistEvidenceTypes)[number];

export type ReviewArtistProfile = {
  id: string;
  platformCode: string;
  platformName: string;
  platformArtistId: string;
  profileUrl: string | null;
  matchStatus: ArtistVerificationStatus;
};

export type ReviewArtistEvidence = {
  id: string;
  type: ArtistEvidenceType;
  sourceUrl: string | null;
  notes: string | null;
  supportsLocality: ArtistLocality | null;
  supportsCountryCode: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type ReviewArtist = {
  id: string;
  canonicalName: string;
  sourceKey: string | null;
  countryCode: string | null;
  locality: ArtistLocality;
  artistType: ArtistType;
  verification: ArtistVerificationStatus;
  imageUrl: string | null;
  biography: string | null;
  updatedAt: string;
  currentRank: number | null;
  currentSongCount: number;
  profiles: ReviewArtistProfile[];
  evidence: ReviewArtistEvidence[];
};

export type ArtistReviewFilter =
  | "needs_review"
  | "verified"
  | "disputed"
  | "all";

export type ArtistReviewQueue = {
  artists: ReviewArtist[];
  counts: {
    total: number;
    needsReview: number;
    verifiedLocal: number;
    disputed: number;
    youtubeLinked: number;
  };
};
