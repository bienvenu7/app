import { NextResponse } from "next/server";
import { confirmOtp } from "@/app/actions/auth";
import { isActionErrorResult } from "@/lib/auth-errors";
import { isSameOriginRequest } from "@/lib/same-origin";

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
  const otp = typeof rec.otp === "string" ? rec.otp.trim() : "";
  if (!email || !otp) {
    return NextResponse.json(
      { __authError: { status: 400, code: "validation" } },
      { status: 400 },
    );
  }

  const result = await confirmOtp(email, otp);
  if (isActionErrorResult(result)) {
    return NextResponse.json(result, { status: result.__authError.status });
  }
  return NextResponse.json(result);
}
