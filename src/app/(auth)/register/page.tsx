"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { slugify } from "@/lib/utils";

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
  organizationName: z.string().min(2, "At least 2 characters"),
  organizationSlug: z
    .string()
    .min(2, "At least 2 characters")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("organizationSlug", slugify(e.target.value));
  };

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Registration failed");
      return;
    }

    router.push(`/org/${json.organization.slug}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First name"
              error={errors.firstName?.message}
              {...register("firstName")}
            />
            <Input
              label="Last name"
              error={errors.lastName?.message}
              {...register("lastName")}
            />
          </div>

          <Input
            label="Email address"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            error={errors.password?.message}
            {...register("password")}
          />

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Organization Details
            </p>
            <div className="space-y-4">
              <Input
                label="Organization name"
                error={errors.organizationName?.message}
                {...register("organizationName", { onChange: onOrgNameChange })}
              />
              <Input
                label="Organization URL slug"
                error={errors.organizationSlug?.message}
                {...register("organizationSlug")}
              />
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-3">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Create Organization
          </Button>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
