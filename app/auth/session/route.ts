import { NextResponse } from "next/server";
import { getAuth } from "@/app/actions/auth";
import { isActionErrorResult } from "@/lib/auth-errors";
import { isSameOriginRequest } from "@/lib/same-origin";

/**
 * Session read — lives outside `/auth/login|register` so nginx `afrue_auth`
 * (credential stuffing) does not count it. Login/register POSTs stay there.
 */
export async function GET(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { __authError: { status: 403, code: "forbidden" } },
      { status: 403 },
    );
  }

  const result = await getAuth();
  if (isActionErrorResult(result)) {
    return NextResponse.json(result, { status: result.__authError.status });
  }
  return NextResponse.json(result);
}
