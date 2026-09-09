import { NextResponse } from "next/server";
import { confirmOtp } from "@/app/actions/auth";
import { isActionErrorResult } from "@/lib/auth-errors";
import type { AuthIdentifier } from "@/lib/auth-identifier";
import { isSameOriginRequest } from "@/lib/same-origin";
import { sanitizeWhatsappInput } from "@/lib/phone-rules";

/**
 * OTP verify — lives outside `/auth/login|register` so nginx `afrue_auth`
 * does not count it. Password login/register stay on those page URLs.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { __authError: { status: 403, code: "forbidden" } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { __authError: { status: 400, code: "validation" } },
      { status: 400 },
    );
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof rec.email === "string" ? rec.email.trim() : "";
  const phone =
    typeof rec.phone === "string" ? sanitizeWhatsappInput(rec.phone) : "";
  const otp = typeof rec.otp === "string" ? rec.otp.trim() : "";
  const hasEmail = !!email;
  const hasPhone = !!phone;
  if (!otp || hasEmail === hasPhone) {
    return NextResponse.json(
      { __authError: { status: 400, code: "validation" } },
      { status: 400 },
    );
  }

  const identifier: AuthIdentifier = hasEmail
    ? { kind: "email", email }
    : { kind: "phone", phone };

  const result = await confirmOtp(identifier, otp);
  if (isActionErrorResult(result)) {
    return NextResponse.json(result, { status: result.__authError.status });
  }
  return NextResponse.json(result);
}
