"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { RefreshCw } from "lucide-react";

type MonitoringData = {
  configuration: {
    autoProcessingEnabled: boolean;
    automaticPublicationEnabled: boolean;
    kNeighbors: number;
    topN: number;
    scheduleIntervalMinutes: number;
    engineVersion: string;
    lastSuccessfulProcessingAt: string | null;
    validationStatus: string;
    schedulerLastCheckedAt: string | null;
    nextScheduleAt: string;
    lastSchedulerReason: string | null;
    parameterDefaultsAreResearchOptimized: boolean;
  };
  validationGate: { status: string; open: boolean; reasons: string[] };
  dataset: {
    currentRevision: string;
    processedRevision: string;
    dirty: boolean;
    lastRatingChangedAt: string | null;
  };
  scheduler: { lastCheckedAt: string | null; nextCheckAt: string; lastOutcome: string | null };
  jobs: { pending: number; running: number; failed: number };
  recentJobs: {
    id: string;
    trigger: string;
    status: string;
    datasetRevision: string;
    engineVersion: string;
    attemptCount: number;
    maxAttempts: number;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorSummary: string | null;
    artifact: {
      verificationStatus: string;
      sourceRatingRevision: string;
      currentRatingRevision: string;
      isStale: boolean;
    } | null;
  }[];
  lastPublishedBatch: { id: number; publishedAt: string | null } | null;
  workers: { workerId: string; engineVersion: string; lastSeenAt: string; online: boolean }[];
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

function formatDuration(value: number | null) {
  if (value === null) return "Belum dimulai";
  if (value < 1_000) return "<1 dtk";
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} dtk`;
  return `${Math.floor(value / 60_000)} mnt ${Math.floor((value % 60_000) / 1_000)} dtk`;
}

function jobStatusLabel(status: string) {
  switch (status) {
    case "PENDING": return "Menunggu";
    case "RUNNING": return "Sedang dihitung";
    case "SUCCEEDED": return "Komputasi selesai";
    case "FAILED": return "Gagal dihitung";
    case "CANCELLED": return "Dibatalkan";
    default: return status;
  }
}

function StatusBadge({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "good" | "warning" | "error" }) {
  const styles = {
    neutral: "bg-gray-100 text-gray-700",
    good: "bg-green-50 text-green-800",
    warning: "bg-orange-100 text-orange-900",
    error: "bg-red-50 text-red-800"
  };
  return <Badge className={styles[tone]}>{children}</Badge>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Card className="min-w-0 p-4"><p className="m-0 text-xs font-medium text-secondary">{label}</p><p className="mb-0 mt-2 break-words text-base font-bold text-gray-950">{value}</p>{detail && <p className="mb-0 mt-1 break-words text-xs leading-5 text-secondary">{detail}</p>}</Card>;
}

export function EngineMonitoring({ mode = "full" }: { mode?: "summary" | "full" }) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setRefreshing(true);
    setError(null);
    void fetch("/api/admin/recommendation-engine", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status engine tidak dapat dimuat.");
        const result = await response.json();
        return result.data as MonitoringData;
      })
      .then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => {
        if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError("Status engine tidak dapat dimuat. Coba muat ulang.");
        }
      })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; controller.abort(); };
  }, [reloadKey]);

  const latestJob = data?.recentJobs[0];
  const latestWorker = data?.workers[0];
  const refreshButton = <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" disabled={refreshing} onClick={() => setReloadKey((key) => key + 1)} aria-label="Muat ulang status engine"><RefreshCw size={14} aria-hidden="true" />{refreshing ? "Memuat" : "Muat ulang"}</Button>;

  return <section aria-labelledby={`engine-monitoring-${mode}`} className={mode === "summary" ? "mt-6" : "mb-8"}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-primary">MONITORING</p><h2 id={`engine-monitoring-${mode}`} className="mb-0 mt-1 text-lg font-bold text-gray-950">Recommendation Engine</h2></div>
      {refreshButton}
    </div>
    {!data && refreshing && <Card className="p-5"><p role="status" className="m-0 text-sm text-secondary">Memuat status worker dan dataset…</p></Card>}
    {error && <Alert className="mb-3">{error}</Alert>}
    {data && <>
      {mode === "summary" ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Dataset" value={data.dataset.dirty ? "Perlu diproses ulang" : "Tidak ada perubahan baru"} detail={`Revision ${data.dataset.currentRevision} · diproses sampai ${data.dataset.processedRevision}`} />
          <Metric label="Validation gate" value={data.validationGate.status} detail="Pemrosesan otomatis OFF" />
          <Metric label="Job terakhir" value={latestJob ? jobStatusLabel(latestJob.status) : "Belum ada job"} detail={latestJob ? `${latestJob.trigger === "AUTO_RATING_CHANGE" ? "Otomatis (terkunci)" : "Manual"} · #${latestJob.id}` : undefined} />
          <Metric label="Worker terakhir" value={latestWorker ? latestWorker.online ? "Online" : "Offline" : "Belum terdeteksi"} detail={latestWorker ? `${latestWorker.workerId} · ${formatDate(latestWorker.lastSeenAt)}` : "Menunggu heartbeat worker"} />
        </div>
        <Alert variant="info" className="mt-3">Pemrosesan otomatis belum tersedia karena algoritma masih menjalani validasi terhadap hasil penelitian Altair.</Alert>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Engine" value={data.configuration.engineVersion} detail={latestWorker ? `Worker ${latestWorker.online ? "terdeteksi" : "terakhir terlihat"}: ${latestWorker.workerId}` : "Worker belum terdeteksi"} />
          <Metric label="Auto-processing" value={data.configuration.autoProcessingEnabled ? "ON" : "OFF"} detail={data.configuration.automaticPublicationEnabled ? "Publikasi otomatis ON" : "Publikasi otomatis OFF"} />
          <Metric label="Validation status" value={data.configuration.validationStatus} detail={data.validationGate.open ? "Gate terbuka" : "Gate terkunci"} />
          <Metric label="Parameter tersimpan" value={`k=${data.configuration.kNeighbors} · Top-${data.configuration.topN}`} detail={`Interval pemeriksaan ${data.configuration.scheduleIntervalMinutes} menit · bukan hasil optimasi penelitian`} />
          <Metric label="Revision dataset" value={data.dataset.currentRevision} detail={`${data.dataset.dirty ? "Dirty · perlu diproses" : "Clean"} · processed ${data.dataset.processedRevision}`} />
          <Metric label="Job terakhir" value={latestJob ? jobStatusLabel(latestJob.status) : "Belum ada job"} detail={latestJob ? `#${latestJob.id} · ${latestJob.trigger === "AUTO_RATING_CHANGE" ? "Otomatis (terkunci)" : "Manual"}` : "Belum ada job tercatat"} />
          <Metric label="Batch published terakhir" value={data.lastPublishedBatch ? `#${data.lastPublishedBatch.id}` : "Belum ada"} detail={formatDate(data.lastPublishedBatch?.publishedAt ?? null)} />
          <Metric label="Komputasi sukses terakhir" value={formatDate(data.configuration.lastSuccessfulProcessingAt)} detail="Selesai dihitung; bukan bukti verifikasi atau publikasi." />
          <Metric label="Heartbeat worker terakhir" value={latestWorker ? latestWorker.online ? "Online" : "Offline" : "Belum terdeteksi"} detail={latestWorker ? `${latestWorker.workerId} · ${latestWorker.engineVersion} · ${formatDate(latestWorker.lastSeenAt)}` : "Belum ada heartbeat tersimpan"} />
        </div>
        <Alert variant="info" className="mt-4">Pemrosesan otomatis belum tersedia karena algoritma masih menjalani validasi terhadap hasil penelitian Altair. Job manual hanya untuk pengujian; hasil Python tetap <code>UNVERIFIED</code> dan tidak otomatis tampil kepada pengguna.</Alert>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-secondary">
          <span>Job pending <strong className="text-gray-900">{data.jobs.pending}</strong></span>
          <span>Berjalan <strong className="text-gray-900">{data.jobs.running}</strong></span>
          <span>Gagal <strong className="text-gray-900">{data.jobs.failed}</strong></span>
          <span>Scheduler terakhir: <strong className="text-gray-900">{formatDate(data.scheduler.lastCheckedAt)}</strong></span>
          <span>Hasil scheduler: <strong className="text-gray-900">{data.scheduler.lastOutcome ?? "Belum diperiksa"}</strong></span>
        </div>
        <section aria-labelledby="recent-jobs-title" className="mt-6">
          <div className="mb-3"><h3 id="recent-jobs-title" className="m-0 text-base font-bold text-gray-950">Job terbaru</h3><p className="mb-0 mt-1 text-xs text-secondary">Komputasi, verifikasi, dan publikasi adalah status terpisah. SUCCEEDED hanya berarti komputasi selesai.</p></div>
          {data.recentJobs.length ? <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1350px] border-collapse text-left text-xs">
                <caption className="sr-only">Sepuluh job rekomendasi terbaru dengan status komputasi, verifikasi, dan publikasi</caption>
                <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500"><tr>
                  <th scope="col" className="px-3 py-3">Job / Trigger</th><th scope="col" className="px-3 py-3">Komputasi</th><th scope="col" className="px-3 py-3">Dataset revision</th><th scope="col" className="px-3 py-3">Engine</th><th scope="col" className="px-3 py-3">Attempt</th><th scope="col" className="px-3 py-3">Waktu / durasi</th><th scope="col" className="px-3 py-3">Verifikasi</th><th scope="col" className="px-3 py-3">Stale</th><th scope="col" className="px-3 py-3">Publikasi</th>
                </tr></thead>
                <tbody className="divide-y divide-border">{data.recentJobs.map((job) => <tr key={job.id}>
                  <td className="max-w-52 px-3 py-3"><code className="block break-all font-mono text-[10px] text-gray-800">{job.id}</code><span className="mt-1 block text-secondary">{job.trigger === "AUTO_RATING_CHANGE" ? "Otomatis (terkunci)" : "Manual"}</span>{job.errorSummary && <p className="mb-0 mt-1 text-red-700">{job.errorSummary}</p>}</td>
                  <td className="px-3 py-3"><StatusBadge tone={job.status === "SUCCEEDED" ? "good" : job.status === "FAILED" ? "error" : job.status === "RUNNING" ? "warning" : "neutral"}>{jobStatusLabel(job.status)}</StatusBadge><span className="mt-1 block text-secondary">{job.status}</span></td>
                  <td className="px-3 py-3">{job.datasetRevision}{job.artifact && <span className="mt-1 block text-secondary">Hasil: {job.artifact.sourceRatingRevision} / kini {job.artifact.currentRatingRevision}</span>}</td>
                  <td className="px-3 py-3">{job.engineVersion}</td>
                  <td className="px-3 py-3">{job.attemptCount}/{job.maxAttempts}</td>
                  <td className="px-3 py-3">Mulai: {formatDate(job.startedAt)}<span className="mt-1 block">Selesai: {formatDate(job.finishedAt)}</span><span className="mt-1 block text-secondary">Durasi: {formatDuration(job.durationMs)}</span></td>
                  <td className="px-3 py-3">{job.artifact ? <StatusBadge tone="warning">{job.artifact.verificationStatus}</StatusBadge> : "Belum ada artifact"}</td>
                  <td className="px-3 py-3">{job.artifact ? job.artifact.isStale ? <StatusBadge tone="error">Stale</StatusBadge> : <StatusBadge tone="good">Tidak stale</StatusBadge> : "—"}</td>
                  <td className="px-3 py-3">Tidak diterbitkan otomatis</td>
                </tr>)}</tbody>
              </table>
            </div>
          </Card> : <Card className="px-5 py-8 text-center text-sm text-secondary">Belum ada job. Workflow CSV Altair manual tetap tersedia di bawah.</Card>}
        </section>
      </>}
    </>}
  </section>;
}
