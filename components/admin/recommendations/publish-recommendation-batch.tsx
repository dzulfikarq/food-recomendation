"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";

export function PublishRecommendationBatch({ batchId, disabled = false }: { batchId: number; disabled?: boolean }) {
  const router = useRouter();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function publish() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/recommendation-batches/${batchId}/publish`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Batch tidak dapat dipublikasikan.");
        setOpen(false);
        router.refresh();
        return;
      }
      setSuccess("Batch berhasil dipublikasikan. Batch aktif sebelumnya menjadi superseded.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Koneksi gagal. Status publikasi belum dapat dipastikan; muat ulang riwayat.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-2">
    <Button type="button" disabled={disabled || pending} onClick={() => { setError(null); setOpen(true); }}>Terbitkan Rekomendasi</Button>
    {error && <Alert>{error}</Alert>}
    {success && <Alert variant="info">{success}</Alert>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby={`publish-title-${batchId}`} aria-describedby={`publish-description-${batchId}`} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id={`publish-title-${batchId}`} className="m-0 text-lg font-bold text-gray-950">Terbitkan batch rekomendasi?</h2>
        <p id={`publish-description-${batchId}`} className="mb-0 mt-2 text-sm leading-6 text-secondary">Server akan memvalidasi ulang dataset, rank, rating, dan status makanan. Batch aktif saat ini akan menjadi SUPERSEDED. Riwayat tidak dihapus.</p>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" disabled={pending} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-white px-5 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">Batal</button><Button type="button" loading={pending} onClick={publish}>Konfirmasi Terbitkan</Button></div>
      </section>
    </div>}
  </div>;
}
