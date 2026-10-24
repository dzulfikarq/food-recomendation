import { ArrowLeft, SearchX } from "lucide-react";
import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="grid min-h-screen place-items-center py-16 text-center">
      <div className="max-w-md"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-soft text-primary"><SearchX size={30} aria-hidden="true" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-primary">404 · HALAMAN TIDAK DITEMUKAN</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-950">Sepertinya tersesat.</h1><p className="mt-3 text-sm leading-6 text-secondary">Halaman belum tersedia atau alamatnya sudah berubah.</p><ButtonLink href="/" variant="secondary" className="mt-5"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke beranda</ButtonLink></div>
    </Container>
  );
}
