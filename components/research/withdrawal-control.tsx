"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert } from "@/components/ui";

export function WithdrawalControl({ studyId, status }: { studyId: number; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!window.confirm("Tarik partisipasi? Rating penelitian tidak akan masuk ekspor baru. Ekspor lama yang memuat data akan ditandai untuk revokasi.")) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/research/participant/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studyId })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Permintaan penarikan gagal.");
        return;
      }
      setMessage("Permintaan tercatat. Rating dikecualikan dari ekspor baru; salinan lama perlu ditindaklanjuti.");
      router.refresh();
    } catch {
      setError("Koneksi gagal. Permintaan penarikan belum dikirim.");
    } finally {
      setPending(false);
    }
  }

  if (status === "WITHDRAWAL_REQUESTED" || status === "WITHDRAWN") return <Alert variant="info">Penarikan: {status === "WITHDRAWN" ? "selesai" : "menunggu tindakan admin"}.</Alert>;
  return <div className="mt-5 border-t border-border pt-4">
    <p className="mb-2 text-xs leading-5 text-secondary">Kamu dapat berhenti kapan saja. Penarikan mengeluarkan rating dari ekspor baru; salinan yang sudah diunduh memerlukan pemberitahuan dan proses revokasi terpisah.</p>
    <Button variant="secondary" className="min-h-10 px-3 text-xs" loading={pending} disabled={pending} onClick={withdraw}>Tarik partisipasi penelitian</Button>
    {message && <p role="status" className="mt-2 text-xs text-green-800">{message}</p>}
    {error && <Alert className="mt-2">{error}</Alert>}
  </div>;
}
