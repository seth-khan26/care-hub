"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const schema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  title: z.string().optional(),
  specialty: z.string().optional(),
  licenseNumber: z.string().optional(),
  npi: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  availability: z.array(
    z.object({
      dayOfWeek: z.string(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      slotDuration: z.string().optional(),
    })
  ).optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewProviderPage() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { availability: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "availability" });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const payload = {
      ...data,
      availability: data.availability?.map((a) => ({
        dayOfWeek: Number(a.dayOfWeek),
        startTime: a.startTime,
        endTime: a.endTime,
        slotDuration: Number(a.slotDuration),
      })),
    };
    const res = await fetch(`/api/providers?orgSlug=${params.orgSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Failed to create provider");
      return;
    }

    router.push(`/org/${params.orgSlug}/providers`);
  };

  return (
    <div>
      <PageHeader title="Add Provider" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Provider Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Title (Dr., NP, etc.)" {...register("title")} />
              <Input label="First name" error={errors.firstName?.message} {...register("firstName")} />
              <Input label="Last name" error={errors.lastName?.message} {...register("lastName")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Specialty" {...register("specialty")} />
              <Input label="License number" {...register("licenseNumber")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="NPI" {...register("npi")} />
              <Input label="Phone" type="tel" {...register("phone")} />
            </div>
            <Input label="Email" type="email" {...register("email")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Availability Schedule</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append({ dayOfWeek: "1", startTime: "09:00", endTime: "17:00", slotDuration: "30" })}
              >
                + Add Day
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.length === 0 && (
              <p className="text-sm text-gray-500">No availability set. Click &quot;Add Day&quot; to configure working hours.</p>
            )}
            {fields.map((field, idx) => (
              <div key={field.id} className="flex items-end gap-3 p-3 rounded border border-gray-200">
                <Select
                  label="Day"
                  options={DAYS.map((d, i) => ({ value: String(i), label: d }))}
                  {...register(`availability.${idx}.dayOfWeek`)}
                />
                <Input label="Start" type="time" {...register(`availability.${idx}.startTime`)} />
                <Input label="End" type="time" {...register(`availability.${idx}.endTime`)} />
                <Select
                  label="Slot (min)"
                  options={[
                    { value: "15", label: "15" },
                    { value: "30", label: "30" },
                    { value: "45", label: "45" },
                    { value: "60", label: "60" },
                  ]}
                  {...register(`availability.${idx}.slotDuration`)}
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => remove(idx)}
                >
                  ×
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {serverError && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-3">{serverError}</p>
        )}

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSubmitting}>Add Provider</Button>
          <Link href={`/org/${params.orgSlug}/providers`}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
