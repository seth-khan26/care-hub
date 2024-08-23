"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { formatTime } from "@/lib/utils";
import Link from "next/link";

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  mrn: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

const schema = z.object({
  patientId: z.string().cuid("Select a patient"),
  providerId: z.string().cuid("Select a provider"),
  date: z.string().min(1, "Required"),
  slotStart: z.string().min(1, "Select a time slot"),
  slotEnd: z.string(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewAppointmentPage() {
  const params = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [slots, setSlots] = useState<TimeSlot[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientId: searchParams.get("patientId") ?? "",
      date: new Date().toISOString().split("T")[0],
    },
  });

  const selectedProviderId = watch("providerId");
  const selectedDate = watch("date");

  useEffect(() => {
    fetch(`/api/providers?orgSlug=${params.orgSlug}`)
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []));
  }, [params.orgSlug]);

  useEffect(() => {
    if (!patientSearch.trim()) return;
    const t = setTimeout(() => {
      fetch(
        `/api/patients?orgSlug=${params.orgSlug}&search=${encodeURIComponent(patientSearch)}`
      )
        .then((r) => r.json())
        .then((d) => setPatients(d.patients ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch, params.orgSlug]);

  useEffect(() => {
    if (!selectedProviderId || !selectedDate) return;
    fetch(
      `/api/providers/${selectedProviderId}/slots?orgSlug=${params.orgSlug}&date=${selectedDate}`
    )
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.slots ?? []);
        setValue("slotStart", "");
        setValue("slotEnd", "");
      });
  }, [selectedProviderId, selectedDate, params.orgSlug, setValue]);

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const res = await fetch(`/api/appointments?orgSlug=${params.orgSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: data.patientId,
        providerId: data.providerId,
        startTime: data.slotStart,
        endTime: data.slotEnd,
        reason: data.reason,
        notes: data.notes,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error ?? "Failed to create appointment");
      return;
    }

    router.push(`/org/${params.orgSlug}/appointments/${json.id}`);
  };

  return (
    <div>
      <PageHeader title="Schedule Appointment" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label="Search patient"
              placeholder="Type name or MRN..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            {patients.length > 0 && (
              <div className="rounded border border-gray-200 divide-y max-h-40 overflow-y-auto">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setValue("patientId", p.id);
                      setPatientSearch(`${p.lastName}, ${p.firstName} (${p.mrn})`);
                      setPatients([]);
                    }}
                  >
                    {p.lastName}, {p.firstName} — {p.mrn}
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" {...register("patientId")} />
            {errors.patientId && (
              <p className="text-sm text-red-600">{errors.patientId.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider & Time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Controller
              control={control}
              name="providerId"
              render={({ field }) => (
                <Select
                  label="Provider"
                  options={providers.map((p) => ({
                    value: p.id,
                    label: `${p.title ?? ""} ${p.firstName} ${p.lastName}`.trim(),
                  }))}
                  placeholder="Select provider..."
                  error={errors.providerId?.message}
                  {...field}
                />
              )}
            />

            <Input
              label="Date"
              type="date"
              error={errors.date?.message}
              {...register("date")}
            />

            {slots.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Available time slots
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.startTime}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => {
                        setValue("slotStart", slot.startTime);
                        setValue("slotEnd", slot.endTime);
                      }}
                      className={`rounded border px-3 py-2 text-sm text-center transition-colors ${
                        watch("slotStart") === slot.startTime
                          ? "bg-blue-600 text-white border-blue-600"
                          : slot.available
                          ? "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                      }`}
                    >
                      {formatTime(slot.startTime)}
                    </button>
                  ))}
                </div>
                {errors.slotStart && (
                  <p className="text-sm text-red-600 mt-1">{errors.slotStart.message}</p>
                )}
              </div>
            )}

            <input type="hidden" {...register("slotStart")} />
            <input type="hidden" {...register("slotEnd")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Reason for visit"
              placeholder="Brief reason..."
              {...register("reason")}
            />
            <Input
              label="Notes"
              placeholder="Additional notes..."
              {...register("notes")}
            />
          </CardContent>
        </Card>

        {serverError && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-3">{serverError}</p>
        )}

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSubmitting}>
            Schedule Appointment
          </Button>
          <Link href={`/org/${params.orgSlug}/appointments`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
