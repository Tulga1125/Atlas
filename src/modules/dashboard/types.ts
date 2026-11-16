export const staffRoles = [
  "administrator",
  "data_editor",
  "editor",
  "writer",
  "analyst",
] as const;

export type StaffRole = (typeof staffRoles)[number];

export type DashboardProfile = {
  id: string | null;
  displayName: string;
  role: StaffRole;
};

export type DashboardSignal = {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  headline: string;
  status: string;
  detectedAt: string;
};

export type DashboardAnomaly = {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  status: string;
  detectedAt: string;
};

export type DashboardStory = {
  id: string;
  headline: string;
  detail: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: string;
  source: "story_lead" | "signal" | "chart";
};

export type DashboardCollectionJob = {
  status: string;
  scheduledFor: string;
  completedAt: string | null;
  itemsReceived: number | null;
  attemptNumber: number;
  errorMessage: string | null;
};

export type DashboardData = {
  profile: DashboardProfile;
  signals: DashboardSignal[];
  anomalies: DashboardAnomaly[];
  stories: DashboardStory[];
  latestJob: DashboardCollectionJob | null;
  calculationStatus: string | null;
  openIdentityReviews: number;
  counts: {
    signals: number;
    anomalies: number;
    stories: number;
    identityReviews: number;
  };
};
