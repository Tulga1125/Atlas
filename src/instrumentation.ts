export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    (process.env.VERCEL_ENV === "production" ||
      process.env.ATLAS_ENV === "production")
  ) {
    const { validateProductionEnvironment } = await import(
      "./lib/production-env"
    );
    validateProductionEnvironment(process.env);
  }
}
