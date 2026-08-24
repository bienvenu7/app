export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { assertAuthSessionSecret } = await import("@/lib/session-hint");
  try {
    assertAuthSessionSecret();
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.error("[boot]", error);
  }
}
