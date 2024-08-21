"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invitation, setInvitation] = useState<{
    email: string;
    role: string;
    organizationName: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    fetch(`/api/auth/invite/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.invitation) setInvitation(d.invitation);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const res = await fetch(`/api/auth/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Failed to accept invitation");
      return;
    }

    router.push(json.redirectTo ?? "/");
  };

  if (loading) return <p className="text-center text-gray-500">Loading...</p>;

  if (!invitation) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-red-600">
            This invitation is invalid or has expired.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept Invitation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-blue-50 rounded p-3 text-sm text-blue-800 mb-4">
          You&apos;ve been invited to join <strong>{invitation.organizationName}</strong> as{" "}
          <strong>{invitation.role}</strong>
          <br />
          Email: {invitation.email}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="First name" error={errors.firstName?.message} {...register("firstName")} />
            <Input label="Last name" error={errors.lastName?.message} {...register("lastName")} />
          </div>
          <Input label="Create password" type="password" error={errors.password?.message} {...register("password")} />

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-3">{serverError}</p>
          )}

          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Create Account & Join
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
