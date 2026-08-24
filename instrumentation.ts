export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  // `next build` runs this hook with NODE_ENV=production. CI has no
  // AUTH_SESSION_SECRET — throwing here aborted every deploy.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertAuthSessionSecret } = await import("@/lib/session-hint");
  try {
    assertAuthSessionSecret();
  } catch (error) {
    console.error("[boot]", error);
  }
}
