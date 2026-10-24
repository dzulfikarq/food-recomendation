"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Power, RotateCcw, Trash2, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";

type Action = "delete" | "deactivate" | "reactivate" | null;

export function FoodRowActions({ id, name, isActive, hasHistory }: { id: number; name: string; isActive: boolean; hasHistory: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = action === "delete" ? "Hapus Makanan?" : action === "deactivate" ? "Nonaktifkan Makanan?" : "Aktifkan Kembali Makanan?";
  const description = action === "delete"
    ? "Makanan ini belum memiliki riwayat penggunaan dan akan dihapus permanen."
    : action === "deactivate"
      ? "Makanan tidak akan ditampilkan pada katalog aktif, tetapi data dan riwayatnya tetap tersimpan."
      : "Makanan akan kembali tersedia sebagai katalog aktif.";

  async function confirm() {
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      const response = action === "delete"
        ? await fetch(`/api/admin/foods/${id}`, { method: "DELETE" })
        : await fetch(`/api/admin/foods/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: action === "reactivate" }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Perubahan tidak dapat dilakukan.");
        return;
      }
      setAction(null);
      router.refresh();
    } catch {
      setError("Koneksi gagal. Perubahan belum tersimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Link href={`/admin/foods/${id}/edit`} aria-label={`Edit ${name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-orange-50 hover:text-orange-800"><Pencil size={16} aria-hidden="true" /></Link>
        {isActive
          ? <button type="button" onClick={() => setAction("deactivate")} aria-label={`Nonaktifkan ${name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"><Power size={16} aria-hidden="true" /></button>
          : <button type="button" onClick={() => setAction("reactivate")} aria-label={`Aktifkan ${name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-accent hover:bg-green-50"><RotateCcw size={16} aria-hidden="true" /></button>}
        {!hasHistory && <button type="button" onClick={() => setAction("delete")} aria-label={`Hapus ${name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} aria-hidden="true" /></button>}
      </div>
      {error && <p className="mt-1 max-w-52 text-xs text-red-700" role="alert">{error}</p>}
      {action && <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setAction(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`confirm-title-${id}`} className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id={`confirm-title-${id}`} className="m-0 text-lg font-bold text-gray-950">{title}</h2><p className="mb-0 mt-2 text-sm leading-6 text-secondary">{description}</p><p className="mb-0 mt-2 text-sm font-semibold text-gray-800">{name}</p></div><button type="button" onClick={() => setAction(null)} disabled={pending} aria-label="Tutup" className="grid size-9 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} aria-hidden="true" /></button></div>
          {action === "delete" && hasHistory && <Alert className="mt-4">Makanan dengan riwayat hanya boleh dinonaktifkan.</Alert>}
          <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => setAction(null)}>Batal</Button><Button type="button" loading={pending} variant={action === "delete" ? "dark" : "primary"} className={action === "delete" ? "bg-red-700 hover:bg-red-800" : ""} onClick={confirm}>{action === "delete" ? "Hapus Permanen" : action === "deactivate" ? "Nonaktifkan" : "Aktifkan"}</Button></div>
        </section>
      </div>}
    </>
  );
}
