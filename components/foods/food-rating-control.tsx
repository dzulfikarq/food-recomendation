"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button, Alert } from "@/components/ui";

export function FoodRatingControl({ foodId, foodName, currentRating, canRate, role }: {
  foodId: number;
  foodName: string;
  currentRating: number | null;
  canRate: boolean;
  role: "USER" | "ADMIN" | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(currentRating ?? 0);
  const [savedRating, setSavedRating] = useState(currentRating ?? 0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasChanges = rating !== savedRating;

  useEffect(() => {
    setRating(currentRating ?? 0);
    setSavedRating(currentRating ?? 0);
  }, [currentRating, foodId]);

  if (!canRate) {
    if (currentRating) return <p className="m-0 text-xs text-secondary">Rating kamu: {currentRating}/5</p>;
    if (role === "ADMIN") return <p className="m-0 text-xs text-secondary">Rating hanya tersedia untuk akun USER.</p>;
    return <Link href="/login" className="text-xs font-semibold text-primary hover:text-primary-hover">Masuk untuk memberi rating</Link>;
  }

  async function saveRating() {
    if (rating < 1 || rating > 5) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/foods/${foodId}/rating`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Rating tidak dapat disimpan.");
        return;
      }
      setSavedRating(rating);
      setMessage("Rating berhasil disimpan.");
      router.refresh();
    } catch {
      setError("Koneksi gagal. Rating belum tersimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <fieldset className="min-w-0 border-t border-border pt-4" aria-describedby={`rating-scale-${foodId}`}>
      <legend className="mb-2 block w-full text-xs font-semibold text-gray-800">{savedRating ? `Rating kamu untuk ${foodName}: ${savedRating}/5` : `Seberapa kamu menyukai ${foodName}?`}</legend>
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-amber-50/70 p-1">
          {[1, 2, 3, 4, 5].map((score) => <label key={score} title={`${score} dari 5`} className="cursor-pointer rounded-lg p-1 hover:bg-amber-50 has-[:disabled]:cursor-not-allowed">
            <input
              className="peer sr-only"
              type="radio"
              name={`rating-${foodId}`}
              value={score}
              checked={rating === score}
              disabled={pending}
              onChange={() => { setRating(score); setMessage(null); setError(null); }}
            />
            <span className={`grid size-9 place-items-center rounded-md text-amber-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-primary ${score <= rating ? "text-amber-500" : "text-gray-300"}`}>
              <Star size={19} fill={score <= rating ? "currentColor" : "none"} aria-hidden="true" />
              <span className="sr-only">{score} dari 5, {score === 1 ? "tidak suka" : score === 2 ? "kurang suka" : score === 3 ? "biasa saja" : score === 4 ? "suka" : "sangat suka"}</span>
            </span>
          </label>)}
        </div>
        <Button type="button" loading={pending} disabled={pending || !hasChanges} onClick={saveRating} className="min-h-10 w-full px-3 text-xs">{pending ? "Menyimpan" : hasChanges ? savedRating ? "Simpan perubahan" : "Simpan rating" : savedRating ? "Tersimpan" : "Pilih rating"}</Button>
      </div>
      <p id={`rating-scale-${foodId}`} className="mb-0 mt-2 text-[11px] leading-5 text-secondary">1 Tidak suka · 2 Kurang suka · 3 Biasa saja · 4 Suka · 5 Sangat suka</p>
      {hasChanges && <p role="status" className="mb-0 mt-2 text-xs font-medium text-orange-800">Perubahan belum disimpan.</p>}
      {message && <p role="status" className="mb-0 mt-2 text-xs font-medium text-accent">{message}</p>}
      {error && <Alert className="mt-2 px-3 py-2 text-xs">{error}</Alert>}
    </fieldset>
  );
}
