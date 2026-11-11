import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, Container, PageHeader } from "@/components/ui";
import { ResearchRatingExperience } from "@/components/research/research-rating-experience";
import { requireUser } from "@/lib/authz";
import { hasCurrentConsent, isCollectionOpen } from "@/lib/research/service";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Rating Penelitian" };

export default async function ResearchRatingPage() {
  const user = await requireUser("/research/rate");
  const userId = Number(user.id);
  const openStudy = await prisma.researchStudy.findFirst({ where: { status: "OPEN" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  let participant = openStudy
    ? await prisma.researchParticipant.findUnique({ where: { studyId_userId: { studyId: openStudy.id, userId } }, include: { study: true, ratings: true } })
    : null;
  if (!participant) {
    participant = await prisma.researchParticipant.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { study: true, ratings: true } });
  }

  if (!participant) return <Container className="py-12"><PageHeader eyebrow="RATING PENELITIAN" title="Mulai dari persetujuan" /><Card className="p-6"><p className="m-0 text-sm text-secondary">Belum ada sesi penelitian untuk akun ini. Baca informasi dan persetujuan terlebih dahulu.</p><Link href="/research" className="mt-4 inline-flex font-semibold text-primary">Buka penelitian</Link></Card></Container>;

  const consent = await hasCurrentConsent(prisma, participant.id, participant.study.consentVersion);
  if (!consent) return <Container className="py-12"><PageHeader eyebrow="RATING PENELITIAN" title="Tinjau persetujuan terbaru" /><Alert variant="info">Persetujuan penelitian belum aktif atau versinya berubah. Tidak ada rating yang dapat dikirim sampai kamu meninjau dan menyetujui versi terbaru.</Alert><Link href="/research" className="mt-4 inline-flex font-semibold text-primary">Tinjau penelitian</Link></Container>;
  if (participant.status === "WITHDRAWAL_REQUESTED" || participant.status === "WITHDRAWN") return <Container className="py-12"><PageHeader eyebrow="RATING PENELITIAN" title="Partisipasi tidak aktif" /><Alert variant="info">Rating penelitian tidak dapat diubah setelah permintaan penarikan.</Alert><Link href="/research" className="mt-4 inline-flex font-semibold text-primary">Lihat status penarikan</Link></Container>;

  const foods = await prisma.food.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, description: true, imageUrl: true } });
  const ratings = new Map(participant.ratings.filter((rating) => rating.consentVersion === participant!.study.consentVersion && rating.source === "CONSENTED_USER_ACTION").map((rating) => [rating.foodId, rating.rating]));
  const canRate = participant.status === "ACTIVE" && isCollectionOpen(participant.study);
  return <Container className="py-10 sm:py-14">
    <PageHeader eyebrow="SESI PARTISIPASI" title={participant.study.title} description="Beri rating hanya pada makanan yang pernah kamu coba. Pilihan dan rating hanya terlihat olehmu." />
    {participant.study.status !== "OPEN" && <Alert variant="info" className="mb-5">Studi sudah ditutup. Rating penelitianmu tersedia untuk ditinjau, tetapi pengubahan baru tidak diterima.</Alert>}
    <ResearchRatingExperience studyId={participant.studyId} foods={foods.map((food) => ({ ...food, rating: ratings.get(food.id) ?? null }))} canRate={canRate} completed={participant.status === "COMPLETED"} />
  </Container>;
}
