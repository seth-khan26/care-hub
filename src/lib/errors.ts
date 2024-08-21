import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { TenantAuthorizationError, TenantNotFoundError } from "./tenancy";

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  if (error instanceof TenantAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TenantNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error("[api-error]", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
