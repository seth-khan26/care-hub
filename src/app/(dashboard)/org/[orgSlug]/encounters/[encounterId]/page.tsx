"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, noteStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/utils";
import Link from "next/link";

interface Encounter {
  id: string;
  encounterDate: string;
  patient: { id: string; firstName: string; lastName: string; mrn: string };
  provider: { firstName: string; lastName: string; title: string };
  clinicalNotes: ClinicalNote[];
}

interface ClinicalNote {
  id: string;
  status: string;
  chiefComplaint: string | null;
  observations: string | null;
  assessment: string | null;
  plan: string | null;
  providerNotes: string | null;
  finalizedAt: string | null;
  createdAt: string;
  versions: { id: string; versionNumber: number; createdAt: string; amendReason: string | null }[];
}

const noteSchema = z.object({
  chiefComplaint: z.string().optional(),
  observations: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  providerNotes: z.string().optional(),
});

const amendSchema = z.object({
  amendReason: z.string().min(1, "Reason required"),
  chiefComplaint: z.string().optional(),
  observations: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  providerNotes: z.string().optional(),
});

type NoteFormData = z.infer<typeof noteSchema>;
type AmendFormData = z.infer<typeof amendSchema>;

export default function EncounterPage() {
  const params = useParams<{ orgSlug: string; encounterId: string }>();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [activeNote, setActiveNote] = useState<ClinicalNote | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "amend">("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const noteForm = useForm<NoteFormData>({ resolver: zodResolver(noteSchema) });
  const amendForm = useForm<AmendFormData>({ resolver: zodResolver(amendSchema) });

  const loadEncounter = async () => {
    const res = await fetch(
      `/api/encounters?orgSlug=${params.orgSlug}&patientId=`
    );
    // Load specific encounter
    const encRes = await fetch(
      `/api/encounters/${params.encounterId}?orgSlug=${params.orgSlug}`
    );
    if (encRes.ok) {
      const data = await encRes.json();
      setEncounter(data);
      if (data.clinicalNotes?.length > 0) {
        setActiveNote(data.clinicalNotes[data.clinicalNotes.length - 1]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEncounter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (activeNote && mode === "edit") {
      noteForm.reset({
        chiefComplaint: activeNote.chiefComplaint ?? "",
        observations: activeNote.observations ?? "",
        assessment: activeNote.assessment ?? "",
        plan: activeNote.plan ?? "",
        providerNotes: activeNote.providerNotes ?? "",
      });
    }
    if (activeNote && mode === "amend") {
      amendForm.reset({
        chiefComplaint: activeNote.chiefComplaint ?? "",
        observations: activeNote.observations ?? "",
        assessment: activeNote.assessment ?? "",
        plan: activeNote.plan ?? "",
        providerNotes: activeNote.providerNotes ?? "",
        amendReason: "",
      });
    }
  }, [activeNote, mode, noteForm, amendForm]);

  const createNote = async () => {
    setSaving(true);
    const res = await fetch(
      `/api/encounters/${params.encounterId}/notes?orgSlug=${params.orgSlug}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    if (res.ok) {
      const note = await res.json();
      setActiveNote(note);
      setMode("edit");
      await loadEncounter();
    }
    setSaving(false);
  };

  const saveNote = async (data: NoteFormData) => {
    if (!activeNote) return;
    setSaving(true);
    setError("");
    const res = await fetch(
      `/api/encounters/${params.encounterId}/notes/${activeNote.id}?orgSlug=${params.orgSlug}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );
    if (res.ok) {
      const note = await res.json();
      setActiveNote(note);
      setMode("view");
    } else {
      const j = await res.json();
      setError(j.error);
    }
    setSaving(false);
  };

  const finalizeNote = async () => {
    if (!activeNote) return;
    setSaving(true);
    const res = await fetch(
      `/api/encounters/${params.encounterId}/notes/${activeNote.id}?orgSlug=${params.orgSlug}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      }
    );
    if (res.ok) {
      const note = await res.json();
      setActiveNote(note);
    }
    setSaving(false);
  };

  const amendNote = async (data: AmendFormData) => {
    if (!activeNote) return;
    setSaving(true);
    setError("");
    const res = await fetch(
      `/api/encounters/${params.encounterId}/notes/${activeNote.id}?orgSlug=${params.orgSlug}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "amend", ...data }),
      }
    );
    if (res.ok) {
      const note = await res.json();
      setActiveNote(note);
      setMode("view");
    } else {
      const j = await res.json();
      setError(j.error);
    }
    setSaving(false);
  };

  if (loading) return <p className="p-8 text-gray-500">Loading...</p>;
  if (!encounter) return <p className="p-8 text-red-500">Encounter not found</p>;

  return (
    <div>
      <PageHeader
        title="Clinical Encounter"
        description={`${formatDate(encounter.encounterDate)} · ${encounter.provider.title} ${encounter.provider.firstName} ${encounter.provider.lastName}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Patient info sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Link
                href={`/org/${params.orgSlug}/patients/${encounter.patient.id}`}
                className="font-medium text-blue-600 hover:underline"
              >
                {encounter.patient.lastName}, {encounter.patient.firstName}
              </Link>
              <p className="text-gray-500 font-mono">{encounter.patient.mrn}</p>
            </CardContent>
          </Card>
        </div>

        {/* Clinical note */}
        <div className="lg:col-span-3 space-y-4">
          {!activeNote ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-gray-500 mb-4">No clinical note yet</p>
                <Button onClick={createNote} isLoading={saving}>
                  Create Clinical Note
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>Clinical Note</CardTitle>
                    <Badge variant={noteStatusBadge(activeNote.status)}>
                      {activeNote.status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {activeNote.status === "DRAFT" && mode === "view" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setMode("edit")}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={finalizeNote}
                          isLoading={saving}
                        >
                          Finalize
                        </Button>
                      </>
                    )}
                    {activeNote.status === "FINALIZED" && mode === "view" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMode("amend")}
                      >
                        Amend
                      </Button>
                    )}
                  </div>
                </div>
                {activeNote.finalizedAt && (
                  <p className="text-xs text-gray-500">
                    Finalized {formatDateTime(activeNote.finalizedAt)}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {mode === "view" && (
                  <div className="space-y-4 text-sm">
                    {[
                      { label: "Chief Complaint", value: activeNote.chiefComplaint },
                      { label: "Observations", value: activeNote.observations },
                      { label: "Assessment", value: activeNote.assessment },
                      { label: "Plan", value: activeNote.plan },
                      { label: "Provider Notes", value: activeNote.providerNotes },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="font-medium text-gray-700">{label}</p>
                        <p className="text-gray-600 whitespace-pre-wrap mt-1">
                          {value || <span className="text-gray-400 italic">Not recorded</span>}
                        </p>
                      </div>
                    ))}
                    {activeNote.versions.length > 0 && (
                      <div className="border-t pt-4">
                        <p className="font-medium text-gray-700 mb-2">Version History</p>
                        {activeNote.versions.map((v) => (
                          <div key={v.id} className="text-xs text-gray-500 flex justify-between">
                            <span>Version {v.versionNumber} — {v.amendReason}</span>
                            <span>{formatDateTime(v.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {mode === "edit" && (
                  <form
                    onSubmit={noteForm.handleSubmit(saveNote)}
                    className="space-y-4"
                  >
                    <Textarea
                      label="Chief Complaint"
                      {...noteForm.register("chiefComplaint")}
                    />
                    <Textarea
                      label="Observations"
                      {...noteForm.register("observations")}
                    />
                    <Textarea
                      label="Assessment"
                      {...noteForm.register("assessment")}
                    />
                    <Textarea
                      label="Plan"
                      {...noteForm.register("plan")}
                    />
                    <Textarea
                      label="Provider Notes"
                      {...noteForm.register("providerNotes")}
                    />
                    {error && (
                      <p className="text-sm text-red-600">{error}</p>
                    )}
                    <div className="flex gap-2">
                      <Button type="submit" isLoading={saving}>
                        Save Draft
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMode("view")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                {mode === "amend" && (
                  <form
                    onSubmit={amendForm.handleSubmit(amendNote)}
                    className="space-y-4"
                  >
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                      Amending a finalized note creates a new version and preserves the original record.
                    </div>
                    <Input
                      label="Reason for amendment"
                      error={amendForm.formState.errors.amendReason?.message}
                      {...amendForm.register("amendReason")}
                    />
                    <Textarea
                      label="Chief Complaint"
                      {...amendForm.register("chiefComplaint")}
                    />
                    <Textarea
                      label="Observations"
                      {...amendForm.register("observations")}
                    />
                    <Textarea
                      label="Assessment"
                      {...amendForm.register("assessment")}
                    />
                    <Textarea
                      label="Plan"
                      {...amendForm.register("plan")}
                    />
                    <Textarea
                      label="Provider Notes"
                      {...amendForm.register("providerNotes")}
                    />
                    {error && (
                      <p className="text-sm text-red-600">{error}</p>
                    )}
                    <div className="flex gap-2">
                      <Button type="submit" isLoading={saving}>
                        Submit Amendment
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMode("view")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
