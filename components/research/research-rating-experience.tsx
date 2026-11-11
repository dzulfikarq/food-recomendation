"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { Alert, Button, Card, SelectField } from "@/components/ui";

const labels = ["Tidak suka", "Kurang suka", "Biasa saja", "Suka", "Sangat suka"];
type Food = { id: number; name: string; category: string; description: string | null; imageUrl: string | null; rating: number | null };

export function ResearchRatingExperience({ studyId, foods: initialFoods, canRate, completed }: {
  studyId: number;
  foods: Food[];
  canRate: boolean;
  completed: boolean;
}) {
  const router = useRouter();
  const [foods, setFoods] = useState(initialFoods);
  const [selectedRatings, setSelectedRatings] = useState<Record<number, number>>({});
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [ratingStatus, setRatingStatus] = useState("all");
  const [pendingFood, setPendingFood] = useState<number | null>(null);
  const [pendingComplete, setPendingComplete] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [success, setSuccess] = useState<Record<number, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(foods.map((food) => food.category))].sort((a, b) => a.localeCompare(b, "id")), [foods]);
  const filteredFoods = useMemo(() => foods.filter((food) => {
    const matchesSearch = `${food.name} ${food.category}`.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id"));
    const matchesCategory = !category || food.category === category;
    const hasRating = food.rating !== null;
    const matchesStatus = ratingStatus === "all" || (ratingStatus === "rated" ? hasRating : !hasRating);
    return matchesSearch && matchesCategory && matchesStatus;
  }), [foods, search, category, ratingStatus]);
  const ratedCount = foods.filter((food) => food.rating !== null).length;

  async function saveRating(foodId: number) {
    const rating = selectedRatings[foodId];
    const previouslyAttested = (foods.find((food) => food.id === foodId)?.rating ?? null) !== null;
    if (!canRate || !(tried[foodId] ?? previouslyAttested) || !rating) return;
    setPendingFood(foodId);
    setPageError(null);
    setErrors((current) => ({ ...current, [foodId]: "" }));
    setSuccess((current) => ({ ...current, [foodId]: "" }));
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/research/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studyId, foodId, rating, tried: true, idempotencyKey })
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors((current) => ({ ...current, [foodId]: result.error?.message ?? "Rating tidak tersimpan." }));
        return;
      }
      setFoods((current) => current.map((food) => food.id === foodId ? { ...food, rating: result.data.rating } : food));
      setSuccess((current) => ({ ...current, [foodId]: "Rating penelitian tersimpan." }));
      router.refresh();
    } catch {
      setErrors((current) => ({ ...current, [foodId]: "Koneksi gagal. Rating belum tersimpan." }));
    } finally {
      setPendingFood(null);
    }
  }

  async function finishSession() {
    setPendingComplete(true);
    setPageError(null);
    try {
      const response = await fetch("/api/research/participant/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studyId })
      });
      const result = await response.json();
      if (!response.ok) {
        setPageError(result.error?.message ?? "Sesi belum dapat diselesaikan.");
        return;
      }
      router.refresh();
    } catch {
      setPageError("Koneksi gagal. Status sesi belum berubah.");
    } finally {
      setPendingComplete(false);
    }
  }

  return <>
    <Card className="mb-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="m-0 text-sm font-bold text-gray-900">Progress partisipasi</p><p className="mb-0 mt-1 text-sm text-secondary">{ratedCount} dari {foods.length} makanan aktif sudah dinilai. Tidak ada target minimum.</p></div><strong className="text-lg text-primary">{foods.length ? Math.round((ratedCount / foods.length) * 100) : 0}%</strong></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100" role="progressbar" aria-label="Progress rating penelitian" aria-valuemin={0} aria-valuemax={foods.length} aria-valuenow={ratedCount}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${foods.length ? (ratedCount / foods.length) * 100 : 0}%` }} /></div>
      <p className="mb-0 mt-3 text-xs leading-5 text-secondary">Nilai hanya makanan yang pernah kamu coba. Kamu dapat melewati item dan kembali nanti.</p>
    </Card>

    {completed && <Alert variant="info" className="mb-5"><strong>Terima kasih atas partisipasimu.</strong> Sesi selesai. Tidak perlu menilai semua makanan.</Alert>}
    {!canRate && !completed && <Alert variant="info" className="mb-5">Periode pengumpulan sudah ditutup. Rating tersimpan tetap dapat ditinjau, tetapi tidak dapat diubah.</Alert>}

    <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[1fr_14rem_12rem]">
      <div className="space-y-1.5"><label htmlFor="research-search" className="block text-sm font-semibold text-gray-800">Cari makanan</label><input id="research-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama atau kategori" className="min-h-11 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-orange-100" /></div>
      <SelectField label="Kategori" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</SelectField>
      <SelectField label="Status rating" value={ratingStatus} onChange={(event) => setRatingStatus(event.target.value)}><option value="all">Semua makanan</option><option value="unrated">Belum dinilai</option><option value="rated">Sudah dinilai</option></SelectField>
    </div>

    {filteredFoods.length ? <div className="grid gap-4 md:grid-cols-2">{filteredFoods.map((food) => {
      const displayedRating = selectedRatings[food.id] ?? food.rating ?? 0;
      return <Card key={food.id} className="overflow-hidden">
        <div className="flex gap-4 p-4 sm:p-5">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-soft sm:size-24">{food.imageUrl ? <Image src={food.imageUrl} alt="" fill sizes="96px" unoptimized className="object-cover" /> : <span className="grid size-full place-items-center text-xs text-secondary">FoodRec</span>}</div>
          <div className="min-w-0"><p className="m-0 text-xs font-semibold text-primary">{food.category}</p><h2 className="mb-0 mt-1 text-base font-bold text-gray-950">{food.name}</h2>{food.description && <p className="mb-0 mt-1 line-clamp-2 text-xs leading-5 text-secondary">{food.description}</p>}{food.rating !== null && <p className="mb-0 mt-2 text-xs font-semibold text-gray-700">Rating penelitian tersimpan: {food.rating}/5</p>}</div>
        </div>
        <fieldset disabled={!canRate || completed || pendingFood === food.id} className="border-t border-border px-4 py-4 sm:px-5">
          <legend className="mb-2 text-xs font-semibold text-gray-800">{food.rating === null ? "Bagaimana pendapatmu tentang makanan ini?" : "Ubah rating penelitian"}</legend>
          <div className="flex items-center gap-1" role="radiogroup" aria-label={`Rating ${food.name}`}>
            {labels.map((label, index) => {
              const score = index + 1;
              return <label key={score} title={`${score} — ${label}`} className="cursor-pointer rounded-lg p-1 hover:bg-amber-50 has-[:disabled]:cursor-not-allowed">
                <input className="peer sr-only" type="radio" name={`research-rating-${food.id}`} value={score} checked={displayedRating === score} onChange={() => { setSelectedRatings((current) => ({ ...current, [food.id]: score })); setSuccess((current) => ({ ...current, [food.id]: "" })); }} />
                <span className={`grid size-9 place-items-center rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-primary ${score <= displayedRating ? "text-amber-500" : "text-gray-300"}`}><Star size={19} fill={score <= displayedRating ? "currentColor" : "none"} aria-hidden="true" /><span className="sr-only">{score} dari 5, {label}</span></span>
              </label>;
            })}
            <span className="ml-2 text-xs font-semibold text-gray-700">{displayedRating ? labels[displayedRating - 1] : "Pilih nilai"}</span>
          </div>
          <p className="mb-0 mt-2 text-[11px] leading-5 text-secondary">1 Tidak suka · 2 Kurang suka · 3 Biasa saja · 4 Suka · 5 Sangat suka</p>
          <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-gray-700"><input type="checkbox" className="mt-1 accent-orange-600" checked={tried[food.id] ?? (food.rating !== null)} onChange={(event) => setTried((current) => ({ ...current, [food.id]: event.target.checked }))} />Saya pernah mencoba makanan ini.</label>
          <Button className="mt-3 min-h-10 w-full px-3 text-xs" loading={pendingFood === food.id} disabled={!canRate || completed || pendingFood === food.id || !displayedRating || !(tried[food.id] ?? (food.rating !== null))} onClick={() => saveRating(food.id)}>{food.rating === null ? "Simpan rating penelitian" : "Simpan perubahan"}</Button>
          {success[food.id] && <p role="status" className="mb-0 mt-2 text-xs font-semibold text-green-800">{success[food.id]}</p>}
          {errors[food.id] && <Alert className="mt-2 px-3 py-2 text-xs">{errors[food.id]}</Alert>}
        </fieldset>
      </Card>;
    })}</div> : <Card className="p-8 text-center"><h2 className="m-0 text-base font-bold">Tidak ada makanan yang cocok</h2><p className="mb-0 mt-2 text-sm text-secondary">Ubah pencarian atau filter untuk melihat makanan lain.</p></Card>}

    {pageError && <Alert className="mt-5">{pageError}</Alert>}
    {canRate && !completed && <Card className="mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="m-0 text-base font-bold">Selesai untuk sekarang?</h2><p className="mb-0 mt-1 text-sm leading-5 text-secondary">Kamu boleh menyelesaikan sesi dengan rating yang ada, termasuk nol rating. Setelah selesai, rating tidak dapat diubah.</p></div><Button loading={pendingComplete} disabled={pendingComplete} onClick={finishSession}>Selesaikan sesi</Button></Card>}
    {completed && <div className="mt-5 text-center"><Link href="/research" className="text-sm font-semibold text-primary hover:text-primary-hover">Lihat status partisipasi dan pilihan penarikan</Link></div>}
  </>;
}
