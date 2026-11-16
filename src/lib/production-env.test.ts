import { expect, it } from "vitest";
import { validateProductionEnvironment } from "./production-env";
it("rejects fixture mode and never puts secret values into validation errors", () => {
  expect(() =>
    validateProductionEnvironment({
      ATLAS_DEMO_MODE: "1",
      CRON_SECRET: "private-value",
    }),
  ).toThrow("ATLAS_DEMO_MODE");
  try {
    validateProductionEnvironment({ CRON_SECRET: "private-value" });
  } catch (error) {
    expect(String(error)).not.toContain("private-value");
  }
});
