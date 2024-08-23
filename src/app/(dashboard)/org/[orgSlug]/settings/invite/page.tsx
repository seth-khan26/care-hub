"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";

const schema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["ADMIN", "PROVIDER", "STAFF"]),
});

type FormData = z.infer<typeof schema>;

export default function InviteStaffPage() {
  const params = useParams<{ orgSlug: string }>();
  const [success, setSuccess] = useState<{ email: string; token: string } | null>(null);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "STAFF" },
  });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const res = await fetch(`/api/staff?orgSlug=${params.orgSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Failed to send invitation");
      return;
    }

    setSuccess({ email: json.invitation.email, token: json.invitation.token });
    reset();
  };

  return (
    <div>
      <PageHeader title="Invite Staff Member" />

      <div className="max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Send Invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email address"
                type="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <Select
                label="Role"
                options={[
                  { value: "ADMIN", label: "Admin" },
                  { value: "PROVIDER", label: "Provider" },
                  { value: "STAFF", label: "Staff" },
                ]}
                {...register("role")}
              />

              {success && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                  <p>Invitation created for <strong>{success.email}</strong></p>
                  <p className="mt-1 text-xs text-green-600">
                    In production, an email would be sent. For now, share this invite link:
                  </p>
                  <code className="mt-1 block text-xs break-all">
                    {typeof window !== "undefined" ? window.location.origin : ""}/accept-invite/{success.token}
                  </code>
                </div>
              )}

              {serverError && (
                <p className="text-sm text-red-600 bg-red-50 rounded p-3">{serverError}</p>
              )}

              <div className="flex gap-3">
                <Button type="submit" isLoading={isSubmitting}>
                  Send Invitation
                </Button>
                <Link href={`/org/${params.orgSlug}/settings`}>
                  <Button type="button" variant="outline">Back</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
