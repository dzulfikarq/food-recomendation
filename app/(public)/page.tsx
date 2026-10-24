import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CookingPot, Database, LockKeyhole, Sparkles, UtensilsCrossed } from "lucide-react";
import { Alert, Badge, Container } from "@/components/ui";
import { getSession } from "@/lib/authz";

const steps = [
  { number: "01", icon: UtensilsCrossed, title: "Jelajahi dan beri rating", description: "Pilih makanan aktif dan simpan rating eksplisit 1–5 untuk membangun profil selera.", status: "Tersedia" },
  { number: "02", icon: Database, title: "Admin ekspor snapshot CSV", description: "Snapshot berisi ID user, ID food, dan rating—tanpa data personal.", status: "Export tersedia" },
  { number: "03", icon: Sparkles, title: "Altair memproses data", description: "UBCF dan Cosine Similarity dijalankan manual; hasil rekomendasi belum diimpor ke website.", status: "Manual · Fase berikutnya" }
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, session] = await Promise.all([searchParams, getSession()]);

  return (
    <>
      <section className="relative overflow-hidden bg-soft">
        <Container className="grid min-h-[600px] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
          <div className="relative z-10 max-w-2xl">
            <Badge className="gap-1.5 bg-white text-orange-900"><Sparkles size={13} aria-hidden="true" /> PERSONAL FOOD DISCOVERY</Badge>
            <h1 className="mt-7 text-5xl font-extrabold leading-[1.08] tracking-[-.055em] text-gray-950 sm:text-6xl lg:text-7xl">Selera kamu,<br /><span className="text-primary">lebih terarah.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-secondary sm:text-lg sm:leading-8">Jelajahi katalog makanan, simpan rating, dan bantu membentuk dataset untuk rekomendasi yang diproses secara terpisah.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {!session ? <><Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover">Buat akun <ArrowRight size={17} aria-hidden="true" /></Link><Link href="/login" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-bold text-gray-800 transition hover:bg-gray-50"><LockKeyhole size={16} aria-hidden="true" /> Masuk</Link></> : <div className="flex flex-wrap items-center gap-3"><div className="rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800"><Check size={17} className="mr-2 inline text-accent" aria-hidden="true" /> Halo, {session.user.name}.</div><Link href={session.user.role === "ADMIN" ? "/admin" : "/foods"} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover">{session.user.role === "ADMIN" ? "Dashboard" : "Jelajahi Makanan"} <ArrowRight size={17} aria-hidden="true" /></Link></div>}
            </div>
            <a href="#cara-kerja" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950">Kenali pendekatan FoodRec <ArrowDown size={15} aria-hidden="true" /></a>
          </div>

          <div className="relative mx-auto flex min-h-[340px] w-full max-w-[500px] items-center justify-center sm:min-h-[420px]" aria-label="Ilustrasi konsep FoodRec" role="img">
            <div className="absolute size-64 rounded-full border border-orange-200 sm:size-80" />
            <div className="absolute size-48 rounded-full border border-dashed border-orange-300 sm:size-64" />
            <div className="relative grid size-40 place-items-center rounded-[2rem] bg-white text-primary shadow-[0_28px_70px_-28px_rgba(234,88,12,.35)] sm:size-52 sm:rounded-[2.5rem]">
              <CookingPot className="size-20 sm:size-28" strokeWidth={1.25} aria-hidden="true" />
              <span className="absolute -right-5 top-5 grid size-12 place-items-center rounded-2xl bg-accent text-white shadow-lg sm:-right-7 sm:size-16"><Sparkles size={24} aria-hidden="true" /></span>
              <span className="absolute -bottom-4 -left-8 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-lg sm:-left-12 sm:px-4 sm:py-3">Taste-led discovery</span>
            </div>
            <span className="absolute right-2 top-10 rounded-full bg-white px-3 py-2 text-xs font-semibold text-orange-900 shadow-md sm:right-0">Personal, by design</span>
            <span className="absolute bottom-8 right-4 rounded-full bg-white p-3 text-primary shadow-md sm:bottom-12 sm:right-2"><UtensilsCrossed size={20} aria-hidden="true" /></span>
          </div>
        </Container>
        <div className="absolute -bottom-28 -left-20 size-64 rounded-full bg-orange-100/70 blur-3xl" />
      </section>

      <section id="cara-kerja" className="scroll-mt-28 py-20 sm:py-28">
        <Container>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">RANCANGAN SISTEM</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">Dari preferensi menuju penemuan</h2>
            <p className="mt-4 text-sm leading-6 text-secondary sm:text-base">Rekomendasi nantinya dihitung di Altair AI Studio Educational 2026.1.1, bukan oleh backend website.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, description, status }) => (
              <article key={number} className="rounded-2xl border border-border bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg sm:p-7">
                <div className="flex items-center justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-soft text-primary"><Icon size={22} aria-hidden="true" /></span><span className="text-sm font-bold tracking-widest text-gray-300">{number}</span></div>
                <h3 className="mt-6 text-lg font-bold tracking-tight text-gray-950">{title}</h3>
                <p className="mb-0 mt-2 text-sm leading-6 text-secondary">{description}</p>
                <Badge className={`mt-5 ${number === "03" ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-800"}`}>{status}</Badge>
              </article>
            ))}
          </div>
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-orange-100 bg-soft p-5 text-sm leading-6 text-orange-950">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="m-0">Katalog, rating, dan ekspor snapshot rating tersedia. Website tidak menghitung algoritma; impor dan publikasi hasil rekomendasi menyusul.</p>
          </div>
        </Container>
      </section>

      <section className="bg-gray-950 py-14 text-white sm:py-16">
        <Container className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-orange-300">MULAI DARI FONDASI</p><h2 className="mb-0 text-2xl font-extrabold tracking-tight sm:text-3xl">Bangun profil FoodRec kamu.</h2></div>
          <Link href={!session ? "/register" : session.user.role === "ADMIN" ? "/admin" : "/foods"} className="inline-flex min-h-12 shrink-0 items-center gap-2 self-start rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover sm:self-auto">{!session ? "Daftar sekarang" : session.user.role === "ADMIN" ? "Dashboard admin" : "Jelajahi makanan"} <ArrowUpRight size={17} aria-hidden="true" /></Link>
          {error === "forbidden" && <Alert>Halaman tersebut hanya tersedia untuk administrator.</Alert>}
        </Container>
      </section>
    </>
  );
}
