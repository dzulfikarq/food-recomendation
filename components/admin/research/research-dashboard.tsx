"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, PageHeader, SelectField } from "@/components/ui";
import { ResearchStudyForm, type ResearchStudyFormValue } from "@/components/admin/research/research-study-form";

type Statistics = {
  registeredParticipants: number;
  consentedParticipants: number;
  activeParticipants: number;
  completedParticipants: number;
  participantsWithRatings: number;
  ratings: number;
  foodsRated: number;
  foodCatalogSize: number;
  activeFoods: number;
  averageRatingsPerContributingParticipant: number;
  participantsWithAtMostOneRating: number;
  matrixDensityPercent: number;
  ratingDistribution: { rating: number; count: number }[];
  ratingsPerFood: { foodId: number; foodName: string; active: boolean; count: number }[];
  sparsityNotice: string;
};
type DashboardData = {
  studies: ResearchStudyFormValue[];
  selectedStudy: ResearchStudyFormValue | null;
  statistics: Statistics | null;
  pendingWithdrawals: { id: number; requestedAt: string; participantId: number; studyTitle: string; ratingsPendingDeletion: number }[];
  exports: { id: number; version: number; filename: string; fileChecksum: string; participantCount: number; ratingCount: number; foodCount: number; consentVersion: string; status: string; withdrawalAffectedAt: string | null; revokedAt: string | null; createdAt: string }[];
};

function date(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ResearchDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (studyId = "") => {
    setLoading(true);
    setError(null);
    try {
      const query = studyId ? `?studyId=${encodeURIComponent(studyId)}` : "";
      const response = await fetch(`/api/admin/research/dashboard${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Dashboard penelitian tidak dapat dimuat.");
      setData(result.data);
      if (result.data.selectedStudy) setSelectedId(String(result.data.selectedStudy.id));
      else setSelectedId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard penelitian tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(""); }, [load]);

  async function statusAction(status: "OPEN" | "CLOSED" | "ARCHIVED") {
    if (!data?.selectedStudy) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/research/studies/${data.selectedStudy.id}/status`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Status penelitian tidak berubah.");
      setMessage(result.message);
      await load(String(data.selectedStudy.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status penelitian tidak berubah.");
    } finally {
      setPending(false);
    }
  }

  async function createExport() {
    if (!data?.selectedStudy) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/research/studies/${data.selectedStudy.id}/exports`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Ekspor penelitian gagal.");
      setMessage(`Dataset versi ${result.data.version} dibuat · ${result.data.ratingCount} rating · SHA-256 ${result.data.fileChecksum}.`);
      await load(String(data.selectedStudy.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ekspor penelitian gagal.");
    } finally {
      setPending(false);
    }
  }

  async function processWithdrawal(id: number) {
    if (!window.confirm("Proses penarikan? Rating dan riwayat nilai partisipan akan dihapus dari basis penelitian. Ekspor lama tetap memerlukan revokasi terpisah.")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/research/withdrawals/${id}/process`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Penarikan belum diproses.");
      setMessage("Rating penelitian dihapus; status withdrawal dan ekspor terdampak tercatat.");
      await load(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penarikan belum diproses.");
    } finally {
      setPending(false);
    }
  }

  async function revokeExport(id: number) {
    if (!window.confirm("Konfirmasi: salinan eksternal telah diidentifikasi dan penerima diminta berhenti menggunakan dataset? File server akan dihapus dan unduhan diblokir.")) return;
    const note = window.prompt("Catatan tindakan revokasi (contoh: penerima diberi tahu pada tanggal ...) :")?.trim();
    if (!note) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/research/exports/${id}/revoke`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note, externalRecipientsNotified: true })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Revokasi ekspor gagal.");
      setMessage("File internal dihapus; revokasi dan konfirmasi penerima tercatat.");
      await load(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revokasi ekspor gagal.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !data) return <><PageHeader eyebrow="RISET TERPISAH" title="Pengumpulan Data Penelitian" /><Card className="p-8 text-center text-sm text-secondary"><p role="status" className="m-0">Memuat statistik dan studi…</p></Card></>;
  return <>
    <PageHeader eyebrow="RISET TERPISAH" title="Pengumpulan Data Penelitian" description="Sumber ResearchRating terpisah dari Rating aplikasi, demo, fixture, DatasetExport, dan Recommendation Engine." />
    {error && <Alert className="mb-5">{error}</Alert>}
    {message && <Alert variant="info" className="mb-5">{message}</Alert>}
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1"><SelectField id="research-study-select" label="Studi" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); void load(event.target.value); }}><option value="">Pilih penelitian</option>{data?.studies.map((study) => <option key={study.id} value={study.id}>#{study.id} · {study.title} · {study.status}</option>)}</SelectField></div>
      <Button variant="secondary" loading={loading} disabled={loading} onClick={() => void load(selectedId)}>Muat ulang</Button>
      <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Tutup form" : "Buat penelitian"}</Button>
    </div>

    {showCreate && <Card className="mb-6 p-5 sm:p-7"><h2 className="mb-5 text-lg font-bold">Draft penelitian baru</h2><ResearchStudyForm onSaved={(id) => { setShowCreate(false); void load(String(id)); }} /></Card>}

    {!data?.selectedStudy ? <Card className="p-8 text-center"><h2 className="m-0 text-lg font-bold">Belum ada penelitian</h2><p className="mb-0 mt-2 text-sm text-secondary">Buat draft, isi teks persetujuan dan kontak penanggung jawab, lalu buka pengumpulan secara eksplisit.</p></Card> : <>
      <Card className="mb-6 p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">STUDI #{data.selectedStudy.id}</p><h2 className="mb-0 mt-1 text-xl font-bold">{data.selectedStudy.title}</h2><p className="mb-0 mt-1 text-sm text-secondary">Versi persetujuan {data.selectedStudy.consentVersion} · {date(data.selectedStudy.startsAt)} – {date(data.selectedStudy.closesAt)}</p></div><Badge className={data.selectedStudy.status === "OPEN" ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700"}>{data.selectedStudy.status}</Badge></div>
        <div className="flex flex-wrap gap-2">{data.selectedStudy.status === "DRAFT" && <Button loading={pending} disabled={pending} onClick={() => statusAction("OPEN")}>Buka pengumpulan</Button>}{data.selectedStudy.status === "OPEN" && <Button variant="secondary" loading={pending} disabled={pending} onClick={() => statusAction("CLOSED")}>Tutup pengumpulan</Button>}{data.selectedStudy.status === "CLOSED" && <Button variant="secondary" loading={pending} disabled={pending} onClick={() => statusAction("ARCHIVED")}>Arsipkan studi</Button>}{data.selectedStudy.status !== "CLOSED" && data.selectedStudy.status !== "ARCHIVED" && <p className="mb-0 self-center text-xs text-secondary">Konfigurasi material yang diubah saat OPEN membutuhkan versi persetujuan baru. Studi tertutup bersifat beku.</p>}</div>
        {data.selectedStudy.status !== "CLOSED" && data.selectedStudy.status !== "ARCHIVED" && <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-bold text-gray-900">Edit konfigurasi dan teks persetujuan</summary><div className="mt-4"><ResearchStudyForm key={data.selectedStudy.id} study={data.selectedStudy} onSaved={(id) => { void load(String(id)); }} /></div></details>}
      </Card>

      {data.statistics && <>
        <section aria-label="Statistik penelitian" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Terdaftar" value={data.statistics.registeredParticipants} detail={`${data.statistics.consentedParticipants} pernah memberi persetujuan`} />
          <Metric label="Partisipan aktif" value={data.statistics.activeParticipants} detail={`${data.statistics.completedParticipants} selesai`} />
          <Metric label="Partisipan memberi rating" value={data.statistics.participantsWithRatings} detail={`rata-rata ${data.statistics.averageRatingsPerContributingParticipant} rating per kontributor`} />
          <Metric label="Total rating penelitian" value={data.statistics.ratings} detail={`${data.statistics.foodsRated} makanan pernah dinilai`} />
          <Metric label="Matriks user-item" value={`${data.statistics.matrixDensityPercent}%`} detail={`${data.statistics.foodCatalogSize} makanan katalog · ${data.statistics.activeFoods} aktif`} />
          <Metric label="Rating sedikit" value={data.statistics.participantsWithAtMostOneRating} detail="0–1 rating; indikator deskriptif, bukan eksklusi ilmiah" />
          <Metric label="Withdrawal menunggu" value={data.pendingWithdrawals.length} detail="dikecualikan dari ekspor baru" />
          <Metric label="Persetujuan saat ini" value={data.selectedStudy.consentVersion} detail="versi baru memerlukan persetujuan eksplisit" />
        </section>
        <Alert variant="info" className="mt-4">{data.statistics.sparsityNotice}</Alert>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <Card className="p-5"><h2 className="m-0 text-base font-bold">Distribusi rating 1–5</h2><div className="mt-4 space-y-3">{data.statistics.ratingDistribution.map((item) => <div key={item.rating} className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-2 text-sm"><span>{item.rating} · {(["Tidak suka", "Kurang suka", "Biasa saja", "Suka", "Sangat suka"] as const)[item.rating - 1]}</span><div className="h-2 overflow-hidden rounded-full bg-orange-100"><div className="h-full bg-primary" style={{ width: `${data.statistics!.ratings ? (item.count / data.statistics!.ratings) * 100 : 0}%` }} /></div><span className="text-right tabular-nums">{item.count}</span></div>)}</div></Card>
          <Card className="p-5"><h2 className="m-0 text-base font-bold">Rating per makanan</h2>{data.statistics.ratingsPerFood.length ? <div className="mt-3 max-h-64 overflow-auto" role="region" aria-label="Tabel rating per makanan" tabIndex={0}><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Food ID · nama</th><th className="py-2 text-right">Rating</th></tr></thead><tbody>{data.statistics.ratingsPerFood.map((food) => <tr key={food.foodId} className="border-t border-border"><td className="py-2">{food.foodId} · {food.foodName}{!food.active && <span className="ml-2 text-xs text-secondary">nonaktif</span>}</td><td className="py-2 text-right tabular-nums">{food.count}</td></tr>)}</tbody></table></div> : <p className="mb-0 mt-3 text-sm text-secondary">Belum ada rating yang memenuhi syarat ekspor.</p>}</Card>
        </div>

        <section className="mt-7"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0 text-lg font-bold">Ekspor dataset penelitian</h2><p className="mb-0 mt-1 text-sm text-secondary">Hanya rating dengan persetujuan versi saat ini; pseudonim participant ID, Food.id, dan rating. Tidak masuk ke ekspor aplikasi atau engine.</p></div><Button loading={pending} disabled={pending || data.selectedStudy.status === "DRAFT"} onClick={createExport}>Buat snapshot CSV + manifest</Button></div>
          {data.exports.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Versi</th><th className="p-3">Partisipan · rating</th><th className="p-3">Checksum</th><th className="p-3">Status</th><th className="p-3">File</th></tr></thead><tbody>{data.exports.map((item) => <tr key={item.id} className="border-t border-border"><td className="p-3">v{item.version}<p className="mb-0 mt-1 text-xs text-secondary">{date(item.createdAt)}</p></td><td className="p-3">{item.participantCount} · {item.ratingCount}</td><td className="p-3 font-mono text-xs" title={item.fileChecksum}>{item.fileChecksum.slice(0, 16)}…</td><td className="p-3"><Badge className={item.status === "READY" ? "bg-green-50 text-green-800" : item.status === "REVOCATION_REQUIRED" ? "bg-red-50 text-red-800" : "bg-gray-100 text-gray-700"}>{item.status}</Badge></td><td className="p-3"><div className="flex flex-wrap gap-2">{item.status === "READY" && <><a className="font-semibold text-primary" href={`/api/admin/research/exports/${item.id}/download`}>CSV</a><a className="font-semibold text-primary" href={`/api/admin/research/exports/${item.id}/manifest`}>Manifest</a></>}{item.status === "REVOCATION_REQUIRED" && <><a className="font-semibold text-primary" href={`/api/admin/research/exports/${item.id}/manifest`}>Manifest</a><Button variant="secondary" className="min-h-8 px-2 text-xs" disabled={pending} onClick={() => revokeExport(item.id)}>Proses revokasi</Button></>}{item.status === "REVOKED" && <a className="font-semibold text-primary" href={`/api/admin/research/exports/${item.id}/manifest`}>Manifest</a>}</div></td></tr>)}</tbody></table></div></Card> : <Card className="p-6 text-sm text-secondary">Belum ada ekspor. Rating kosong tidak diekspor.</Card>}
        </section>
      </>}

      <section className="mt-7"><h2 className="mb-3 text-lg font-bold">Permintaan penarikan</h2>{data.pendingWithdrawals.length ? <div className="grid gap-3">{data.pendingWithdrawals.map((withdrawal) => <Card key={withdrawal.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="m-0 text-sm font-bold">Partisipan pseudonim #{withdrawal.participantId} · {withdrawal.studyTitle}</p><p className="mb-0 mt-1 text-xs text-secondary">Diminta {date(withdrawal.requestedAt)} · {withdrawal.ratingsPendingDeletion} rating menunggu penghapusan</p></div><Button variant="secondary" disabled={pending} onClick={() => processWithdrawal(withdrawal.id)}>Proses penarikan</Button></Card>)}</div> : <Card className="p-5 text-sm text-secondary">Tidak ada permintaan withdrawal tertunda.</Card>}</section>
    </>}
    <p role="status" className="sr-only">{loading ? "Memuat data" : "Data penelitian diperbarui"}</p>
  </>;
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <Card className="p-4"><p className="m-0 text-xs font-semibold text-secondary">{label}</p><p className="mb-0 mt-2 break-words text-2xl font-bold text-gray-950">{value}</p><p className="mb-0 mt-1 text-xs leading-5 text-secondary">{detail}</p></Card>;
}
