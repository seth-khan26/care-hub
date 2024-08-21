"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, appointmentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

interface AppointmentDetail {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  notes: string | null;
  checkedInAt: string | null;
  patient: { id: string; firstName: string; lastName: string; mrn: string };
  provider: { id: string; firstName: string; lastName: string; title: string };
  location: { name: string } | null;
  encounter: { id: string } | null;
}

export default function AppointmentDetailPage() {
  const params = useParams<{ orgSlug: string; appointmentId: string }>();
  const router = useRouter();
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetch(
      `/api/appointments/${params.appointmentId}?orgSlug=${params.orgSlug}`
    )
      .then((r) => r.json())
      .then((d) => {
        setAppt(d);
        setLoading(false);
      });
  }, [params]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    const res = await fetch(
      `/api/appointments/${params.appointmentId}?orgSlug=${params.orgSlug}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    if (res.ok) {
      const updated = await res.json();
      setAppt(updated);
    }
    setUpdating(false);
  };

  const startEncounter = async () => {
    if (!appt) return;
    setUpdating(true);
    const res = await fetch(`/api/encounters?orgSlug=${params.orgSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: appt.id,
        patientId: appt.patient.id,
        providerId: appt.provider.id,
        encounterDate: appt.startTime,
      }),
    });

    if (res.ok) {
      const enc = await res.json();
      await updateStatus("IN_PROGRESS");
      router.push(`/org/${params.orgSlug}/encounters/${enc.id}`);
    }
    setUpdating(false);
  };

  if (loading) return <p className="p-8 text-gray-500">Loading...</p>;
  if (!appt) return <p className="p-8 text-red-500">Appointment not found</p>;

  return (
    <div>
      <PageHeader
        title="Appointment"
        description={`${formatDateTime(appt.startTime)}`}
        action={
          <Badge variant={appointmentStatusBadge(appt.status)}>
            {appt.status.replace("_", " ")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appointment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Patient</p>
                  <Link
                    href={`/org/${params.orgSlug}/patients/${appt.patient.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {appt.patient.lastName}, {appt.patient.firstName}
                  </Link>
                  <p className="text-gray-400 text-xs">{appt.patient.mrn}</p>
                </div>
                <div>
                  <p className="text-gray-500">Provider</p>
                  <p className="font-medium">
                    {appt.provider.title} {appt.provider.firstName}{" "}
                    {appt.provider.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Start time</p>
                  <p>{formatDateTime(appt.startTime)}</p>
                </div>
                <div>
                  <p className="text-gray-500">End time</p>
                  <p>{formatDateTime(appt.endTime)}</p>
                </div>
                {appt.location && (
                  <div>
                    <p className="text-gray-500">Location</p>
                    <p>{appt.location.name}</p>
                  </div>
                )}
                {appt.checkedInAt && (
                  <div>
                    <p className="text-gray-500">Checked in</p>
                    <p>{formatDateTime(appt.checkedInAt)}</p>
                  </div>
                )}
              </div>
              {appt.reason && (
                <div>
                  <p className="text-gray-500">Reason</p>
                  <p>{appt.reason}</p>
                </div>
              )}
              {appt.notes && (
                <div>
                  <p className="text-gray-500">Notes</p>
                  <p>{appt.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {appt.encounter && (
            <Card>
              <CardContent className="pt-6">
                <Link
                  href={`/org/${params.orgSlug}/encounters/${appt.encounter.id}`}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  View Encounter & Clinical Notes →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appt.status === "SCHEDULED" && (
                <>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => updateStatus("CONFIRMED")}
                    isLoading={updating}
                  >
                    Confirm
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => updateStatus("CHECKED_IN")}
                    isLoading={updating}
                  >
                    Check In Patient
                  </Button>
                </>
              )}
              {appt.status === "CONFIRMED" && (
                <Button
                  className="w-full"
                  onClick={() => updateStatus("CHECKED_IN")}
                  isLoading={updating}
                >
                  Check In Patient
                </Button>
              )}
              {appt.status === "CHECKED_IN" && !appt.encounter && (
                <Button
                  className="w-full"
                  onClick={startEncounter}
                  isLoading={updating}
                >
                  Start Encounter
                </Button>
              )}
              {appt.status === "IN_PROGRESS" && appt.encounter && (
                <Link href={`/org/${params.orgSlug}/encounters/${appt.encounter.id}`}>
                  <Button className="w-full">Open Encounter</Button>
                </Link>
              )}
              {!["CANCELLED", "NO_SHOW", "COMPLETED"].includes(appt.status) && (
                <>
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => updateStatus("CANCELLED")}
                    isLoading={updating}
                  >
                    Cancel Appointment
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => updateStatus("NO_SHOW")}
                    isLoading={updating}
                  >
                    Mark No Show
                  </Button>
                </>
              )}
              {appt.status === "IN_PROGRESS" && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => updateStatus("COMPLETED")}
                  isLoading={updating}
                >
                  Complete
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
