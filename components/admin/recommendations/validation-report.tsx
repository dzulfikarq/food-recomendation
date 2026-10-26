import type { RecommendationValidationReport } from "@/lib/recommendations/types";
import { Alert, Badge, Card } from "@/components/ui";

export function RecommendationValidationReportView({ report }: { report: RecommendationValidationReport }) {
  const { summary, source, parameters } = report;
  return (
    <div className="space-y-4">
      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="m-0 text-xs text-secondary">Total rekomendasi</p><p className="mb-0 mt-1 text-xl font-bold">{summary.recommendationCount}</p></div>
        <div><p className="m-0 text-xs text-secondary">Pengguna mendapat rekomendasi</p><p className="mb-0 mt-1 text-xl font-bold">{summary.userCount}</p></div>
        <div><p className="m-0 text-xs text-secondary">Tanpa rekomendasi</p><p className="mb-0 mt-1 text-xl font-bold">{summary.usersWithoutRecommendations}</p></div>
        <div><p className="m-0 text-xs text-secondary">Baris valid / invalid</p><p className="mb-0 mt-1 text-xl font-bold">{summary.validRows} / {summary.invalidRows}</p></div>
      </Card>

      <Card className="space-y-2 p-5 text-sm">
        <h3 className="m-0 text-base font-bold">Dataset dan parameter sumber</h3>
        <p className="m-0 text-secondary">Dataset #{source.datasetExportId} · {source.filename} · {source.rowCount} rating · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.createdAt))}</p>
        <p className="m-0 text-secondary">SHA-256 <span className="break-all font-mono text-xs">{source.checksum}</span></p>
        <p className="m-0 text-secondary">User k-NN: k={parameters.kNeighbors} · Similarity: {parameters.similarity} · Top-N: {parameters.topN}</p>
      </Card>

      {report.warnings.map((warning) => <Alert key={warning.code} variant="info">{warning.message}</Alert>)}
      {report.errors.length > 0 && <Card className="overflow-hidden border-red-200">
        <div className="border-b border-red-100 bg-red-50 px-4 py-3"><h3 className="m-0 text-sm font-bold text-red-900">Laporan validasi · {report.errors.length} kesalahan</h3></div>
        <div className="max-h-72 overflow-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase text-gray-500"><tr><th className="px-4 py-2">Baris</th><th className="px-4 py-2">Kolom</th><th className="px-4 py-2">Alasan</th></tr></thead><tbody className="divide-y divide-border">{report.errors.map((error, index) => <tr key={`${error.row}-${error.field ?? ""}-${index}`}><td className="px-4 py-2 font-mono">{error.row || "—"}</td><td className="px-4 py-2">{error.field ?? "CSV"}</td><td className="px-4 py-2">{error.message}</td></tr>)}</tbody></table></div>
      </Card>}

      {report.preview.length > 0 && <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><h3 className="m-0 text-sm font-bold">Preview rekomendasi</h3><Badge>{Math.min(report.preview.length, 20)} baris maks.</Badge></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Makanan</th><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Validasi</th></tr></thead><tbody className="divide-y divide-border">{report.preview.map((row) => <tr key={`${row.row}-${row.userId}-${row.foodId}`}><td className="px-4 py-3">#{row.userId} · {row.userName ?? "User tidak ditemukan"}</td><td className="px-4 py-3">#{row.foodId} · {row.foodName ?? "Makanan tidak ditemukan"}{row.category && <span className="block text-xs text-secondary">{row.category}</span>}</td><td className="px-4 py-3">{row.rank}</td><td className="px-4 py-3"><Badge className={row.valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>{row.valid ? "Valid" : "Periksa"}</Badge></td></tr>)}</tbody></table></div>
        {summary.recommendationCount > report.preview.length && <p className="m-0 px-4 py-3 text-xs text-secondary">Preview dibatasi; total file {summary.recommendationCount} rekomendasi.</p>}
      </Card>}
    </div>
  );
}
