"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, SelectField } from "@/components/ui";

type DatasetOption = { id: number; filename: string; rowCount: number; createdAt: string };

export function RecommendationImportForm({ datasets }: { datasets: DatasetOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ id: number; status: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setBatch(null);
    try {
      const response = await fetch("/api/admin/recommendation-batches/import", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (result.data?.batchId) {
        setBatch({ id: result.data.batchId, status: result.data.status });
        router.refresh();
      }
      if (!response.ok) setError(result.error?.message ?? "Validasi CSV gagal.");
    } catch {
      setError("Koneksi gagal. Import belum dapat dikonfirmasi.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-5">
    {datasets.length ? <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Dataset ekspor sumber" name="datasetExportId" required defaultValue=""><option value="" disabled>Pilih snapshot rating</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>#{dataset.id} · {dataset.filename} · {dataset.rowCount} rating</option>)}</SelectField>
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">File hasil Altair</span><input name="file" type="file" accept=".csv,text/csv" required aria-describedby="recommendation-file-hint recommendation-file-selected" onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)} className="block min-h-12 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft file:px-3 file:py-2 file:text-xs file:font-bold file:text-orange-900" /><span id="recommendation-file-hint" className="block text-xs text-secondary">Pilih CSV UTF-8, maksimal 2 MB, header `user_id,item_id,rank`.</span><span id="recommendation-file-selected" aria-live="polite" className="block text-xs font-medium text-gray-700">{selectedFile ? `${selectedFile.name} · ${new Intl.NumberFormat("id-ID").format(selectedFile.size)} byte` : "Belum ada file dipilih."}</span></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">User k-NN (k)</span><input name="kNeighbors" type="number" min="1" max="100" step="1" required placeholder="Contoh: 3" className="min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-orange-100" /><span className="block text-xs text-secondary">Catat parameter yang benar-benar dipakai di Altair.</span></label>
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">Top-N per pengguna</span><input name="topN" type="number" min="1" max="100" step="1" required placeholder="Contoh: 1 atau 2" className="min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-orange-100" /><span className="block text-xs text-secondary">Sesuai jumlah kandidat yang diekspor untuk tiap user.</span></label>
      </div>
      <p className="m-0 text-xs leading-5 text-secondary">Isi k dan Top-N sesuai nilai yang benar-benar dipakai saat pemrosesan manual di Altair.</p>
      <Button type="submit" loading={pending} disabled={pending}>{pending ? "Memeriksa file" : "Impor dan validasi CSV"}</Button>
    </form> : <Alert variant="info">Belum ada dataset ekspor. Buat snapshot rating di <Link href="/admin/ratings" className="font-bold underline">Data Rating</Link> terlebih dahulu.</Alert>}
    {error && <Alert>{error}</Alert>}
    {batch && <Alert variant={batch.status === "VALIDATED" ? "info" : "error"}>Batch #{batch.id} {batch.status === "VALIDATED" ? "tervalidasi, tetapi belum diterbitkan." : "berstatus Draft karena CSV perlu diperbaiki."} Tinjau laporan dan preview pada tahap 4.{" "}<Link href="#step-4" className="font-bold underline">Lanjut ke tahap 4</Link></Alert>}
  </div>;
}
