"use client";

import { useEffect } from "react";
import { Button, ButtonLink, Container } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("FoodRec page error", error.digest); }, [error.digest]);
  return (
    <Container className="grid min-h-screen place-items-center py-16 text-center">
      <div className="max-w-md"><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">TERJADI KENDALA</p><h1 className="mt-3 text-3xl font-extrabold text-gray-950">Halaman belum bisa dimuat.</h1><p className="mt-3 text-sm leading-6 text-secondary">Coba muat ulang. Detail teknis tidak ditampilkan di halaman ini.</p><div className="mt-6 flex justify-center gap-3"><Button variant="secondary" onClick={reset}>Coba lagi</Button><ButtonLink href="/">Kembali ke beranda</ButtonLink></div></div>
    </Container>
  );
}
