"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileDown } from "lucide-react";
import { Alert, Button, ButtonLink } from "@/components/ui";

type ExportRecord = { id: number; filename: string; fileChecksum: string; rowCount: number };

export function CreateDatasetExport({ ratingCount }: { ratingCount: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ExportRecord | null>(null);

  async function createSnapshot() {
    setPending(true);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch("/api/admin/rating-datasets", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Snapshot tidak dapat dibuat.");
        return;
      }
      setCreated(result.data);
      router.refresh();
    } catch {
      setError("Koneksi gagal. Snapshot belum dibuat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {ratingCount > 0 ? <Button onClick={createSnapshot} loading={pending} disabled={pending}><FileDown size={16} aria-hidden="true" /> Buat Snapshot CSV</Button> : <Button disabled><FileDown size={16} aria-hidden="true" /> Belum ada rating</Button>}
      {ratingCount === 0 && <p className="m-0 text-xs leading-5 text-secondary">Snapshot akan tersedia setelah USER memberi rating pada makanan.</p>}
      {error && <Alert>{error}</Alert>}
      {created && <Alert variant="info"><span className="font-semibold">Snapshot {created.filename} dibuat · {created.rowCount} baris.</span><ButtonLink href={`/api/admin/rating-datasets/${created.id}/download`} variant="secondary" className="ml-3 min-h-9 px-3 text-xs"><Download size={14} aria-hidden="true" /> Unduh CSV</ButtonLink></Alert>}
    </div>
  );
}
