"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, InputField, TextAreaField } from "@/components/ui";

export type ResearchStudyFormValue = {
  id: number;
  title: string;
  description: string;
  purpose: string;
  dataCollected: string;
  dataUse: string;
  withdrawalInstructions: string;
  consentVersion: string;
  consentDocument: string;
  contactName: string;
  contactEmail: string;
  startsAt: string;
  closesAt: string;
  retentionUntil: string | null;
  retentionPolicy: string;
  status: string;
};

type Fields = Omit<ResearchStudyFormValue, "id" | "status" | "retentionUntil"> & { retentionUntil: string };
const emptyFields: Fields = { title: "", description: "", purpose: "", dataCollected: "", dataUse: "", withdrawalInstructions: "", consentVersion: "v1", consentDocument: "", contactName: "", contactEmail: "", startsAt: "", closesAt: "", retentionUntil: "", retentionPolicy: "" };

function asLocalDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function datePayload(value: string, original?: string | null) {
  return original && asLocalDate(original) === value ? original : new Date(value).toISOString();
}

function formFields(study?: ResearchStudyFormValue | null): Fields {
  return study ? {
    title: study.title,
    description: study.description,
    purpose: study.purpose,
    dataCollected: study.dataCollected,
    dataUse: study.dataUse,
    withdrawalInstructions: study.withdrawalInstructions,
    consentVersion: study.consentVersion,
    consentDocument: study.consentDocument,
    contactName: study.contactName,
    contactEmail: study.contactEmail,
    startsAt: asLocalDate(study.startsAt),
    closesAt: asLocalDate(study.closesAt),
    retentionUntil: study.retentionUntil ? asLocalDate(study.retentionUntil) : "",
    retentionPolicy: study.retentionPolicy ?? ""
  } : emptyFields;
}

export function ResearchStudyForm({ study, onSaved }: { study?: ResearchStudyFormValue | null; onSaved: (id: number) => void }) {
  const [fields, setFields] = useState<Fields>(() => formFields(study));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = study?.status === "CLOSED" || study?.status === "ARCHIVED";

  useEffect(() => setFields(formFields(study)), [study]);
  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }
  function payload() {
    return {
      ...fields,
      startsAt: datePayload(fields.startsAt, study?.startsAt),
      closesAt: datePayload(fields.closesAt, study?.closesAt),
      retentionUntil: datePayload(fields.retentionUntil ?? "", study?.retentionUntil)
    };
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(study ? `/api/admin/research/studies/${study.id}` : "/api/admin/research/studies", {
        method: study ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload())
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Pengaturan penelitian gagal disimpan.");
        return;
      }
      setMessage(study ? "Pengaturan penelitian tersimpan." : "Draft penelitian dibuat.");
      onSaved(result.data.id);
    } catch {
      setError("Koneksi gagal. Perubahan tidak tersimpan.");
    } finally {
      setPending(false);
    }
  }

  const disabled = Boolean(readOnly || pending);
  return <form onSubmit={save} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <InputField label="Judul penelitian" name="title" maxLength={180} required disabled={disabled} value={fields.title} onChange={(event) => set("title", event.target.value)} />
      <InputField label="Versi persetujuan" name="consentVersion" maxLength={40} required disabled={disabled} value={fields.consentVersion} onChange={(event) => set("consentVersion", event.target.value)} hint="Naikkan versi bila mengubah isi atau informasi material saat studi dibuka." />
    </div>
    <TextAreaField label="Penjelasan singkat" name="description" maxLength={8000} required disabled={disabled} value={fields.description} onChange={(event) => set("description", event.target.value)} />
    <div className="grid gap-4 sm:grid-cols-2">
      <TextAreaField label="Tujuan pengumpulan" name="purpose" maxLength={8000} required disabled={disabled} value={fields.purpose} onChange={(event) => set("purpose", event.target.value)} />
      <TextAreaField label="Data yang dikumpulkan" name="dataCollected" maxLength={8000} required disabled={disabled} value={fields.dataCollected} onChange={(event) => set("dataCollected", event.target.value)} />
      <TextAreaField label="Penggunaan data" name="dataUse" maxLength={8000} required disabled={disabled} value={fields.dataUse} onChange={(event) => set("dataUse", event.target.value)} />
      <TextAreaField label="Cara berhenti/menarik data" name="withdrawalInstructions" maxLength={8000} required disabled={disabled} value={fields.withdrawalInstructions} onChange={(event) => set("withdrawalInstructions", event.target.value)} />
    </div>
    <TextAreaField label="Teks persetujuan lengkap (ditampilkan apa adanya)" name="consentDocument" maxLength={8000} required disabled={disabled} value={fields.consentDocument} onChange={(event) => set("consentDocument", event.target.value)} />
    <div className="grid gap-4 sm:grid-cols-2">
      <InputField label="Nama kontak penelitian" name="contactName" maxLength={120} required disabled={disabled} value={fields.contactName} onChange={(event) => set("contactName", event.target.value)} />
      <InputField label="Email kontak penelitian" name="contactEmail" type="email" maxLength={254} required disabled={disabled} value={fields.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} />
      <InputField label="Mulai pengumpulan" name="startsAt" type="datetime-local" required disabled={disabled || study?.status === "OPEN"} value={fields.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
      <InputField label="Tutup pengumpulan" name="closesAt" type="datetime-local" required disabled={disabled} value={fields.closesAt} onChange={(event) => set("closesAt", event.target.value)} />
      <InputField label="Batas retensi data" name="retentionUntil" type="datetime-local" required disabled={disabled} value={fields.retentionUntil} onChange={(event) => set("retentionUntil", event.target.value)} hint="Harus setelah tanggal tutup pengumpulan." />
    </div>
    <TextAreaField label="Kebijakan retensi dan penanganan data" name="retentionPolicy" maxLength={8000} required disabled={disabled} value={fields.retentionPolicy} onChange={(event) => set("retentionPolicy", event.target.value)} />
    <p className="-mt-3 text-xs text-secondary">Jelaskan lama simpan, pemilik keputusan, dan cara data akan dihapus atau ditinjau ulang.</p>
    {study?.status === "CLOSED" || study?.status === "ARCHIVED" ? <Alert variant="info">Studi tertutup/diarsipkan bersifat read-only.</Alert> : <Button loading={pending} disabled={disabled}>{study ? "Simpan konfigurasi" : "Buat draft penelitian"}</Button>}
    {message && <p role="status" className="text-sm font-medium text-green-800">{message}</p>}
    {error && <Alert>{error}</Alert>}
  </form>;
}
