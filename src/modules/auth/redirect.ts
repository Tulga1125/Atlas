const DEFAULT_STAFF_PATH = "/dashboard";
const ATLAS_ORIGIN = "https://atlas.local";

export function getSafeStaffRedirect(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return DEFAULT_STAFF_PATH;
  }

  try {
    const target = new URL(value, ATLAS_ORIGIN);
    if (target.origin !== ATLAS_ORIGIN) {
      return DEFAULT_STAFF_PATH;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_STAFF_PATH;
  }
}
