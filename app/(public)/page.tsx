import Link from "next/link";
import { ArrowRight, ArrowUpRight, CookingPot, Database, Sparkles, Star, UtensilsCrossed } from "lucide-react";
import { Badge, ButtonLink, Card, Container } from "@/components/ui";
import { getSession } from "@/lib/authz";
import { getUserRecommendations } from "@/lib/recommendations/service";
import { testPrototypeAutomationEnabled } from "@/lib/recommendations/test-prototype";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(value);
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, session] = await Promise.all([searchParams, getSession()]);
  const prototypeEnabled = testPrototypeAutomationEnabled();

  if (session?.user.role === "USER") {
    const userId = Number(session.user.id);
    const [ratingCount, foodCount, activeRatingCount, recommendations] = await Promise.all([
      prisma.rating.count({ where: { userId } }),
      prisma.food.count({ where: { isActive: true } }),
      prisma.rating.count({ where: { userId, food: { isActive: true } } }),
      getUserRecommendations(userId)
    ]);
    const name = session.user.name.trim().split(/\s+/)[0] || session.user.name;
    const nextAction = recommendations.status === "READY"
      ? { href: "/recommendations", label: "Lihat rekomendasi" }
      : recommendations.status === "PROCESSING"
        ? { href: "/recommendations", label: "Pantau pemrosesan" }
      : foodCount === 0
        ? { href: "/foods", label: "Lihat katalog makanan" }
        : ratingCount > 0 && activeRatingCount >= foodCount
          ? { href: "/my-ratings", label: "Lihat rating saya" }
          : ratingCount > 0
            ? { href: "/foods?ratingStatus=unrated", label: "Cari yang belum dinilai" }
            : { href: "/foods", label: "Jelajahi makanan" };

    return <Container className="py-10 sm:py-14">
      {error === "forbidden" && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Halaman tersebut hanya tersedia untuk administrator.</p>}
      <section className="rounded-3xl border border-orange-100 bg-soft p-6 sm:p-9">
        <Badge className="gap-1.5 bg-white text-orange-900"><Sparkles size={13} aria-hidden="true" /> RUANG SELERA KAMU</Badge>
        <h1 className="mb-0 mt-5 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">Hai, {name}!</h1>
        <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-secondary sm:text-base">Kamu sudah memberi rating pada <strong className="text-gray-900">{ratingCount} makanan</strong>. Jelajahi makanan yang kamu kenal dan simpan pendapatmu—kamu tidak perlu menilai semuanya.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/foods"><UtensilsCrossed size={16} aria-hidden="true" /> Jelajahi Makanan</ButtonLink>
          <ButtonLink href="/my-ratings" variant="secondary"><Star size={16} aria-hidden="true" /> Rating Saya</ButtonLink>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="p-5 sm:p-6">
          <p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-primary">LANGKAH BERIKUTNYA</p>
          <h2 className="mb-0 mt-3 text-lg font-bold text-gray-950">{ratingCount ? "Lanjutkan sesuai seleramu" : "Mulai dari makanan yang kamu kenal"}</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-secondary">{ratingCount
            ? prototypeEnabled ? "Beri atau ubah rating; Python UBCF akan memproses ulang rekomendasi secara otomatis." : "Beri rating pada makanan yang pernah kamu coba, atau lihat rating yang sudah tersimpan."
            : prototypeEnabled ? "Nilai makanan yang kamu kenal; Python UBCF akan memproses rating pada prototipe lokal." : "Beberapa rating dapat membantu menggambarkan seleramu, tetapi tidak menjamin rekomendasi langsung tersedia. Hasil muncul setelah admin menerbitkan rekomendasi untuk akunmu."}</p>
          <Link href={nextAction.href} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">{nextAction.label}<ArrowRight size={15} aria-hidden="true" /></Link>
          <p className="mb-0 mt-3 text-xs text-secondary">{foodCount} makanan aktif tersedia di katalog.</p>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-primary">REKOMENDASI</p><h2 className="mb-0 mt-3 text-lg font-bold text-gray-950">Status rekomendasi</h2></div>
            {recommendations.publishedAt && <Badge className="bg-green-50 text-green-800">Diperbarui {formatDate(recommendations.publishedAt)}</Badge>}
          </div>
          <p className="mb-0 mt-3 text-sm leading-6 text-secondary">{recommendationMessage(recommendations.status, recommendations.recommendations.length, prototypeEnabled)}</p>
          <Link href="/recommendations" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-bold text-gray-800 hover:bg-gray-50">{recommendations.status === "READY" ? "Lihat rekomendasi" : "Lihat status rekomendasi"}<ArrowRight size={15} aria-hidden="true" /></Link>
        </Card>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Alur FoodRec">
        <JourneyStep number="1" icon={UtensilsCrossed} title="Jelajahi makanan" description="Cari makanan yang menarik bagimu." />
        <JourneyStep number="2" icon={Star} title="Beri rating" description="Nilai makanan yang memang kamu kenal." />
        <JourneyStep number="3" icon={Sparkles} title="Lihat rekomendasi" description={prototypeEnabled ? "Python UBCF memproses hasil otomatis pada prototipe lokal." : "Cek hasil setelah admin menerbitkannya."} />
      </div>
    </Container>;
  }

  return <>
    <section className="relative overflow-hidden bg-soft">
      <Container className="grid min-h-[540px] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
        <div className="relative z-10 max-w-2xl">
          <Badge className="gap-1.5 bg-white text-orange-900"><Sparkles size={13} aria-hidden="true" /> TEMUKAN MAKANAN SESUAI SELERA</Badge>
          <h1 className="mt-7 text-5xl font-extrabold leading-[1.08] tracking-[-.055em] text-gray-950 sm:text-6xl lg:text-7xl">Kenali seleramu,<br /><span className="text-primary">temukan pilihanmu.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-secondary sm:text-lg sm:leading-8">Jelajahi katalog makanan, beri rating pada yang pernah kamu coba, lalu lihat rekomendasi yang sudah disiapkan untuk akunmu.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {!session ? <><ButtonLink href="/register">Buat akun <ArrowRight size={17} aria-hidden="true" /></ButtonLink><ButtonLink href="/login" variant="secondary">Masuk</ButtonLink></> : <ButtonLink href="/admin">Buka dashboard admin <ArrowRight size={17} aria-hidden="true" /></ButtonLink>}
            <ButtonLink href="/foods" variant="secondary">Jelajahi makanan</ButtonLink>
          </div>
          {error === "forbidden" && <p role="alert" className="mt-4 text-sm font-medium text-red-700">Halaman tersebut hanya tersedia untuk administrator.</p>}
        </div>

        <div className="relative mx-auto flex min-h-[300px] w-full max-w-[500px] items-center justify-center sm:min-h-[380px]" aria-label="Ilustrasi makanan" role="img">
          <div className="absolute size-64 rounded-full border border-orange-200 sm:size-80" />
          <div className="absolute size-48 rounded-full border border-dashed border-orange-300 sm:size-64" />
          <div className="relative grid size-40 place-items-center rounded-[2rem] bg-white text-primary shadow-[0_28px_70px_-28px_rgba(234,88,12,.35)] sm:size-52 sm:rounded-[2.5rem]">
            <CookingPot className="size-20 sm:size-28" strokeWidth={1.25} aria-hidden="true" />
            <span className="absolute -right-5 top-5 grid size-12 place-items-center rounded-2xl bg-accent text-white shadow-lg sm:-right-7 sm:size-16"><Sparkles size={24} aria-hidden="true" /></span>
            <span className="absolute -bottom-4 -left-8 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-lg sm:-left-12 sm:px-4 sm:py-3">Dari selera kamu</span>
          </div>
          <span className="absolute right-2 top-10 rounded-full bg-white px-3 py-2 text-xs font-semibold text-orange-900 shadow-md sm:right-0">Pilihan lebih personal</span>
        </div>
      </Container>
    </section>

    <section className="py-16 sm:py-20">
      <Container>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">CARA MENGGUNAKAN FOODREC</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">Mulai dari makanan yang kamu kenal</h2>
          <p className="mt-4 text-sm leading-6 text-secondary sm:text-base">{prototypeEnabled
            ? "Rating tersimpan di akunmu. Python UBCF memproses rekomendasi otomatis pada prototipe lokal; production tetap terkunci."
            : "Rating tersimpan di akunmu. Admin mengolah data secara terpisah dan menerbitkan rekomendasi; menyimpan rating tidak otomatis menghasilkan rekomendasi."}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <JourneyStep number="1" icon={UtensilsCrossed} title="Jelajahi makanan" description="Cari nama atau kategori, lalu buka detail untuk melihat foto dan deskripsi." />
          <JourneyStep number="2" icon={Star} title="Beri rating 1–5" description="Nilai hanya makanan yang kamu kenal. Kamu bisa mengubah rating kapan saja." />
          <JourneyStep number="3" icon={Database} title="Lihat rekomendasi" description={prototypeEnabled ? "Sistem menghitung hasil Python setelah rating disimpan." : "Admin memproses data secara terpisah. Hasil tampil setelah batch yang sesuai diterbitkan."} />
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-100 bg-soft p-5">
          <p className="m-0 max-w-3xl text-sm leading-6 text-orange-950">{prototypeEnabled
            ? "Prototipe lokal memproses rekomendasi otomatis setelah rating disimpan; hasil bergantung pada dukungan data rating."
            : "FoodRec tidak menjanjikan rekomendasi langsung setelah rating disimpan. Rekomendasi bergantung pada hasil pemrosesan dan publikasi admin."}</p>
          <Link href={!session ? "/register" : "/admin"} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">{!session ? "Buat akun" : "Dashboard admin"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </Container>
    </section>
  </>;
}

function recommendationMessage(status: string, count: number, prototypeEnabled: boolean) {
  switch (status) {
    case "READY": return prototypeEnabled
      ? `${count} rekomendasi Python UBCF tersedia untukmu. Buka halaman rekomendasi untuk melihat detailnya.`
      : `${count} rekomendasi tersedia untukmu. Buka halaman rekomendasi untuk melihat detailnya.`;
    case "PROCESSING": return "Python UBCF sedang memproses ratingmu. Hasil akan diperbarui otomatis.";
    case "PROCESSING_FAILED": return "Pemrosesan rekomendasi gagal. Periksa worker Python lokal lalu coba simpan ulang rating.";
    case "NO_RATINGS": return prototypeEnabled
      ? "Belum ada rating. Nilai makanan yang kamu kenal; Python UBCF memproses rating pada prototipe lokal."
      : "Belum ada rating. Mulai dengan makanan yang pernah kamu coba; hasil tidak langsung tersedia setelah rating.";
    case "NO_BATCH": return prototypeEnabled
      ? "Ratingmu tersimpan. Sistem sedang menyiapkan pemrosesan otomatis pada prototipe lokal."
      : "Ratingmu tersimpan. Belum ada rekomendasi yang diterbitkan; kamu bisa tetap menjelajahi katalog.";
    case "NOT_INCLUDED": return prototypeEnabled
      ? "Akunmu belum tercakup dalam hasil Python terbaru. Simpan perubahan rating untuk memicu pemrosesan ulang."
      : "Akunmu belum tercakup dalam hasil yang diterbitkan terakhir. Kamu tetap bisa menjelajahi makanan dan rating milikmu.";
    case "ALL_RATED": return "Semua rekomendasi yang tersedia sudah kamu nilai. Rating tersebut tetap tersimpan di akunmu.";
    case "NO_AVAILABLE_FOODS": return "Belum ada rekomendasi aktif yang bisa ditampilkan. Coba jelajahi katalog makanan.";
    case "NO_NEIGHBORS": return "Data belum memiliki pengguna dengan pola rating serupa.";
    case "NO_PREDICTIONS": return "Tetangga serupa belum menilai makanan aktif yang belum kamu nilai.";
    default: return "Status rekomendasi belum dapat dimuat.";
  }
}

function JourneyStep({ number, icon: Icon, title, description }: { number: string; icon: typeof Star; title: string; description: string }) {
  return <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-soft text-primary"><Icon size={21} aria-hidden="true" /></span><span className="text-sm font-bold tracking-widest text-gray-300">{number.padStart(2, "0")}</span></div><h2 className="mb-0 mt-5 text-lg font-bold tracking-tight text-gray-950">{title}</h2><p className="mb-0 mt-2 text-sm leading-6 text-secondary">{description}</p></Card>;
}
