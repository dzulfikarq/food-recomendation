"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";

type Study = {
  id: number;
  title: string;
  consentVersion: string;
  consentDocument: string;
};

export function ConsentPanel({ study, available, canParticipate, participation }: {
  study: Study;
  available: boolean;
  canParticipate: boolean;
  participation: { status: string; consented: boolean; acceptedAt?: Date | string | null; ratingCount: number } | null;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function acceptConsent() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/research/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studyId: study.id, version: study.consentVersion, accepted: true })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Persetujuan belum tersimpan.");
        return;
      }
      setMessage("Persetujuan tercatat. Kamu dapat mulai atau melanjutkan penilaian.");
      router.push("/research/rate");
      router.refresh();
    } catch {
      setError("Koneksi gagal. Persetujuan belum tersimpan.");
    } finally {
      setPending(false);
    }
  }

  if (!canParticipate) {
    return <Card className="p-5 sm:p-6"><h2 className="m-0 text-lg font-bold">Ingin berpartisipasi?</h2><p className="mt-2 text-sm leading-6 text-secondary">Masuk atau buat akun USER. Persetujuan penelitian tetap diminta secara terpisah; akun lama tidak otomatis menjadi responden.</p><div className="flex flex-wrap gap-3"><ButtonLink href={`/login?callbackURL=${encodeURIComponent("/research")}`}>Masuk</ButtonLink><ButtonLink href={`/register?callbackURL=${encodeURIComponent("/research")}`} variant="secondary">Buat akun</ButtonLink></div></Card>;
  }

  if (participation?.status === "WITHDRAWAL_REQUESTED" || participation?.status === "WITHDRAWN") {
    return <Alert variant="info">Status partisipasi: {participation.status === "WITHDRAWN" ? "penarikan selesai" : "penarikan sedang diproses"}. Rating penelitian tidak akan masuk ekspor baru.</Alert>;
  }

  if (participation?.consented) {
    return <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="m-0 text-sm font-bold text-gray-900">Persetujuan versi {study.consentVersion} tersimpan</p><p className="mb-0 mt-1 text-sm text-secondary">{participation.acceptedAt ? `Diterima ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(participation.acceptedAt))}. ` : ""}{participation.ratingCount} makanan sudah kamu nilai. Kamu boleh melanjutkan atau menyelesaikan sesi tanpa target jumlah tertentu.</p></div>
      <ButtonLink href="/research/rate">{participation.status === "COMPLETED" ? "Lihat sesi" : "Lanjutkan penilaian"}</ButtonLink>
    </Card>;
  }

  if (!available) return <Alert variant="info">Pengumpulan data belum berada dalam periode aktif. Dokumen dapat dibaca, tetapi persetujuan dan rating belum dapat dikirim.</Alert>;

  return <Card className="p-5 sm:p-6">
    <h2 className="m-0 text-lg font-bold">Persetujuan partisipasi</h2>
    <p className="mt-2 text-sm leading-6 text-secondary">Persetujuan lama tidak digunakan otomatis. Tinjau versi terbaru dan centang pilihan secara sadar untuk ikut.</p>
    <div className="my-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-gray-50 p-4 text-sm leading-6 text-gray-800">{study.consentDocument}</div>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6 text-gray-800">
      <input className="mt-1 size-4 accent-orange-600" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
      <span>Saya telah membaca dokumen persetujuan versi <strong>{study.consentVersion}</strong>, memahami partisipasi bersifat sukarela, dan setuju berpartisipasi.</span>
    </label>
    <Button className="mt-4 w-full sm:w-auto" loading={pending} disabled={!accepted || pending} onClick={acceptConsent}>Setuju dan lanjutkan</Button>
    {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
    {error && <Alert className="mt-3">{error}</Alert>}
    <p className="mb-0 mt-4 text-xs leading-5 text-secondary">Tidak setuju? Tutup halaman ini. Kamu tetap dapat memakai fitur FoodRec biasa.</p>
    <Link href="/foods" className="mt-2 inline-flex text-sm font-semibold text-primary hover:text-primary-hover">Kembali ke katalog FoodRec</Link>
  </Card>;
}
