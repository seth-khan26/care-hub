"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  dateOfBirth: z.string().min(1, "Required"),
  sex: z.enum(["male", "female", "other", "unknown"]).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRel: z.string().optional(),
  insurerName: z.string().optional(),
  policyNumber: z.string().optional(),
  groupNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewPatientPage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const res = await fetch(`/api/patients?orgSlug=${params.orgSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Failed to create patient");
      return;
    }

    router.push(`/org/${params.orgSlug}/patients/${json.id}`);
  };

  return (
    <div>
      <PageHeader title="Register New Patient" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Demographics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Date of birth"
                type="date"
                error={errors.dateOfBirth?.message}
                {...register("dateOfBirth")}
              />
              <Select
                label="Sex"
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                  { value: "other", label: "Other" },
                  { value: "unknown", label: "Unknown" },
                ]}
                placeholder="Select..."
                {...register("sex")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone" type="tel" {...register("phone")} />
              <Input label="Email" type="email" {...register("email")} />
            </div>
            <Input label="Address" {...register("address")} />
            <div className="grid grid-cols-3 gap-4">
              <Input label="City" {...register("city")} />
              <Input label="State" {...register("state")} />
              <Input label="ZIP" {...register("zip")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Name" {...register("emergencyName")} />
              <Input label="Phone" type="tel" {...register("emergencyPhone")} />
              <Input label="Relationship" {...register("emergencyRel")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Insurance (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Insurer name" {...register("insurerName")} />
              <Input label="Policy number" {...register("policyNumber")} />
            </div>
            <Input label="Group number" {...register("groupNumber")} />
          </CardContent>
        </Card>

        {serverError && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-3">
            {serverError}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSubmitting}>
            Register Patient
          </Button>
          <Link href={`/org/${params.orgSlug}/patients`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
