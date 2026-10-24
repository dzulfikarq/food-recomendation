"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileSpreadsheet, FileUp, RotateCw } from "lucide-react";
import { MAX_FOOD_CSV_BYTES } from "@/lib/food/constants";
import { Alert, Button, Card } from "@/components/ui";

type CsvError = { row: number; field?: string; message: string };
type Preview = {
  importId: number;
  filename: string;
  totalRows: number;
  validRows: number;
  reusedDraft: boolean;
  preview: Array<{ foodCode: string; name: string; category: string; taste: string; origin: string }>;
};

export function FoodImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<number | null>(null);

  async function validateCsv() {
    if (!file) {
      setMessage("Pilih file CSV terlebih dahulu.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > MAX_FOOD_CSV_BYTES) {
      setMessage("Pilih file .csv dengan ukuran maksimum 2 MB.");
      return;
    }

    setPending(true);
    setMessage(null);
    setPreview(null);
    setErrors([]);
    setCompleted(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/foods/imports/preview", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error?.message ?? "CSV gagal divalidasi.");
        setErrors(result.error?.details ?? []);
        return;
      }
      setPreview(result.data);
      setMessage(result.message);
    } catch {
      setMessage("Koneksi gagal. CSV belum tersimpan.");
    } finally {
      setPending(false);
    }
  }

  async function commitCsv() {
    if (!preview) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/foods/imports/${preview.importId}/commit`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error?.message ?? "Import gagal. Tidak ada data yang ditambahkan.");
        setErrors(result.error?.details ?? []);
        return;
      }
      setCompleted(result.data.insertedRows);
      setPreview(null);
      setFile(null);
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("Koneksi gagal. Periksa status import sebelum mencoba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="m-0 text-lg font-bold text-gray-950">Pilih file katalog</h2><p className="mb-0 mt-2 text-sm leading-6 text-secondary">Format UTF-8, maksimal 2 MB dan 1.000 baris. Import hanya menambahkan Food Code baru.</p></div>
          <a href="/api/admin/foods/imports/template" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"><FileSpreadsheet size={16} aria-hidden="true" /> Unduh Template CSV</a>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1.5"><span className="block text-sm font-semibold text-gray-800">File CSV</span><input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setPreview(null); setErrors([]); setMessage(null); setCompleted(null); }} className="block min-h-12 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft file:px-3 file:py-2 file:text-xs file:font-bold file:text-orange-900" /></label>
          <Button type="button" loading={pending && !preview} disabled={!file || pending} onClick={validateCsv}><FileUp size={16} aria-hidden="true" /> Validasi & Preview</Button>
        </div>
        {file && <p className="mb-0 mt-2 text-xs text-secondary">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
      </Card>

      {message && <Alert variant={errors.length || (completed === null && !preview) ? "error" : "info"}>{message}</Alert>}
      {completed !== null && <Alert variant="info"><Check size={16} className="mr-2 inline" aria-hidden="true" /> {completed} makanan ditambahkan.</Alert>}

      {errors.length > 0 && <Card className="overflow-hidden border-red-200">
        <div className="border-b border-red-100 bg-red-50 px-5 py-4"><h2 className="m-0 text-sm font-bold text-red-900">Kesalahan validasi ({errors.length})</h2><p className="mb-0 mt-1 text-xs text-red-800">Semua kesalahan harus diperbaiki. Tidak ada baris yang diimport.</p></div>
        <ul className="m-0 max-h-72 list-none space-y-2 overflow-auto p-5">{errors.map((error, index) => <li key={`${error.row}-${error.field}-${index}`} className="text-sm text-red-800"><span className="font-bold">{error.row > 0 ? `Baris ${error.row}` : "File"}{error.field ? ` · ${error.field}` : ""}:</span> {error.message}</li>)}</ul>
      </Card>}

      {preview && <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border bg-soft px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-white text-accent"><Check size={18} aria-hidden="true" /></span><h2 className="m-0 text-base font-bold text-gray-950">Preview siap diimport</h2></div><p className="mb-0 mt-2 text-sm text-secondary">{preview.filename} · {preview.validRows} baris valid{preview.reusedDraft ? " · menggunakan draft yang sama" : ""}</p></div>
          <Button type="button" loading={pending} disabled={pending} onClick={commitCsv}><Check size={16} aria-hidden="true" /> Impor {preview.validRows} Makanan</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm"><thead className="bg-white text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Food Code</th><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Rasa</th><th className="px-4 py-3">Asal</th></tr></thead><tbody className="divide-y divide-border">{preview.preview.map((food) => <tr key={food.foodCode}><td className="px-5 py-3 font-mono text-xs">{food.foodCode}</td><td className="px-4 py-3 font-semibold">{food.name}</td><td className="px-4 py-3">{food.category}</td><td className="px-4 py-3">{food.taste}</td><td className="px-4 py-3">{food.origin}</td></tr>)}</tbody></table>
        </div>
        {preview.totalRows > preview.preview.length && <p className="mb-0 border-t border-border px-5 py-3 text-xs text-secondary">Preview menampilkan {preview.preview.length} baris pertama. Seluruh {preview.totalRows} baris akan diimport.</p>}
        <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-xs text-gray-500"><RotateCw size={14} aria-hidden="true" /> Data akan dicek ulang saat commit. Makanan lama tidak diubah.</div>
      </Card>}
    </div>
  );
}
