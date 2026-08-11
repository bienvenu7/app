/** Preuve de paiement — aligné sur l'API (Août 2026). */

export const ALLOWED_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedProofMime = (typeof ALLOWED_PROOF_MIME_TYPES)[number];

/** HTML accept attribute for the file picker. */
export const PROOF_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

export const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_PROOF_FILES = 10;

export function isAllowedProofMime(type: string): type is AllowedProofMime {
  return (ALLOWED_PROOF_MIME_TYPES as readonly string[]).includes(type);
}

export function isProofImage(type: string): boolean {
  return (
    type === "image/jpeg" || type === "image/png" || type === "image/webp"
  );
}

export function isProofPdf(type: string): boolean {
  return type === "application/pdf";
}

export type ProofValidationError =
  | "invalid_type"
  | "file_too_large"
  | "too_many_files";

export type ProofValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; error: ProofValidationError; fileName?: string };

/**
 * Validate newly picked files against existing selection + API rules.
 */
export function validateProofFiles(
  incoming: File[],
  alreadySelectedCount: number,
): ProofValidationResult {
  if (alreadySelectedCount + incoming.length > MAX_PROOF_FILES) {
    return { ok: false, error: "too_many_files" };
  }

  for (const file of incoming) {
    if (!isAllowedProofMime(file.type)) {
      return { ok: false, error: "invalid_type", fileName: file.name };
    }
    if (file.size > MAX_PROOF_FILE_BYTES) {
      return { ok: false, error: "file_too_large", fileName: file.name };
    }
  }

  return { ok: true, files: incoming };
}
