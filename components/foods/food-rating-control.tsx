"use client";

import { useState } from "react";
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setMessage("Rating tersimpan.");
      router.refresh();
    } catch {
      setError("Koneksi gagal. Rating belum tersimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-xs font-semibold text-gray-700">{currentRating ? `Rating kamu: ${currentRating}/5` : "Beri rating 1–5"}</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={`Rating untuk ${foodName}`}>
        {[1, 2, 3, 4, 5].map((score) => <button
          key={score}
          type="button"
          role="radio"
          aria-checked={rating === score}
          aria-label={`${score} dari 5`}
          onClick={() => { setRating(score); setMessage(null); }}
          className="grid size-9 place-items-center rounded-lg text-amber-500 transition hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-primary"
        ><Star size={19} fill={rating >= score ? "currentColor" : "none"} aria-hidden="true" /></button>)}
        <Button type="button" loading={pending} disabled={pending || rating < 1} onClick={saveRating} className="ml-auto min-h-9 px-3 text-xs">Simpan</Button>
      </div>
      {message && <p role="status" className="mb-0 mt-2 text-xs font-medium text-accent">{message}</p>}
      {error && <Alert className="mt-2 px-3 py-2 text-xs">{error}</Alert>}
    </div>
  );
}
