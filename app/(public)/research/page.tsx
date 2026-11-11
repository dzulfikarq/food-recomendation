import type { Metadata } from "next";
import Link from "next/link";
import { Container, Card, PageHeader, Badge, Alert } from "@/components/ui";
import { ConsentPanel } from "@/components/research/consent-panel";
import { WithdrawalControl } from "@/components/research/withdrawal-control";
import { getSession } from "@/lib/authz";
import { isCollectionOpen } from "@/lib/research/service";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Penelitian FoodRec" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(value);
}

export default async function ResearchPage() {
  const session = await getSession();
  const userId = session?.user.role === "USER" ? Number(session.user.id) : null;
  const [study, pastParticipations] = await Promise.all([
    prisma.researchStudy.findFirst({ where: { status: "OPEN" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    userId ? prisma.researchParticipant.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, studyId: true, status: true, withdrawalRequestedAt: true, withdrawnAt: true, consents: { orderBy: { acceptedAt: "desc" }, take: 1, select: { version: true, acceptedAt: true, revokedAt: true } }, _count: { select: { ratings: true } }, study: { select: { title: true, status: true } } }
    }) : Promise.resolve([])
  ]);
  const currentParticipant = study && userId
    ? pastParticipations.find((participant) => participant.studyId === study.id) ?? null
    : null;
  const currentConsent = currentParticipant
    ? await prisma.researchConsent.findUnique({ where: { participantId_version: { participantId: currentParticipant.id, version: study!.consentVersion } }, select: { acceptedAt: true, revokedAt: true } })
    : null;
  const participation = currentParticipant ? {
    participantId: currentParticipant.id,
    status: currentParticipant.status,
    consented: Boolean(currentConsent && !currentConsent.revokedAt),
    acceptedAt: currentConsent?.acceptedAt ?? null,
    ratingCount: currentParticipant._count.ratings
  } : null;
  const history = pastParticipations.filter((participant) => participant.studyId !== study?.id);

  return <Container className="py-10 sm:py-14">
    <PageHeader eyebrow="PARTISIPASI SUKARELA" title="Pengumpulan Data Penelitian" description="Rating penelitian disimpan terpisah dari rating aplikasi dan tidak otomatis masuk ke rekomendasi FoodRec." />

    {study ? <>
      <Card className="mb-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2"><Badge>Studi #{study.id}</Badge><Badge className={isCollectionOpen(study) ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700"}>{isCollectionOpen(study) ? "Pengumpulan dibuka" : "Di luar periode pengumpulan"}</Badge></div>
        <h2 className="mb-0 mt-4 text-2xl font-bold text-gray-950">{study.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary">{study.description}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Info title="Tujuan pengumpulan" body={study.purpose} />
          <Info title="Data yang dikumpulkan" body={study.dataCollected} />
          <Info title="Penggunaan data" body={study.dataUse} />
          <Info title="Pilihan dan penarikan" body={study.withdrawalInstructions} />
        </div>
        <p className="mb-0 mt-5 border-t border-border pt-4 text-sm leading-6 text-secondary">Periode: {formatDate(study.startsAt)} – {formatDate(study.closesAt)}. Retensi data sampai {study.retentionUntil ? formatDate(study.retentionUntil) : "belum ditentukan"}{study.retentionPolicy ? `; kebijakan: ${study.retentionPolicy}` : ""}. Kontak: <a className="font-semibold text-primary" href={`mailto:${study.contactEmail}`}>{study.contactName} ({study.contactEmail})</a>.</p>
        <ul className="mb-0 mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700">
          <li>Partisipasi sukarela; kamu dapat berhenti dan meminta penarikan data.</li>
          <li>Nilai hanya makanan yang pernah kamu coba. Makanan lain boleh dilewati.</li>
          <li>Rating tidak menampilkan jawaban partisipan lain.</li>
        </ul>
      </Card>
      <ConsentPanel study={study} available={isCollectionOpen(study)} canParticipate={session?.user.role === "USER"} participation={participation} />
      {currentParticipant && currentParticipant.status !== "WITHDRAWN" && currentParticipant.status !== "WITHDRAWAL_REQUESTED" && <WithdrawalControl studyId={study.id} status={currentParticipant.status} />}
    </> : <Card className="p-6 text-center"><h2 className="m-0 text-lg font-bold">Belum ada penelitian yang dibuka</h2><p className="mb-0 mt-2 text-sm text-secondary">Admin akan menampilkan dokumen persetujuan dan periode pengumpulan setelah studi siap.</p><Link className="mt-4 inline-flex font-semibold text-primary" href="/foods">Lanjut jelajahi katalog FoodRec</Link></Card>}

    {history.length > 0 && <section className="mt-8" aria-labelledby="research-history-title"><h2 id="research-history-title" className="mb-3 text-lg font-bold">Partisipasi sebelumnya</h2><div className="grid gap-3">{history.map((participant) => <Card key={participant.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="m-0 text-sm font-bold">{participant.study.title}</h3><p className="mb-0 mt-1 text-xs text-secondary">Status {participant.status} · {participant._count.ratings} rating penelitian{participant.consents[0] ? ` · Persetujuan ${participant.consents[0].version}${participant.consents[0].revokedAt ? " (dicabut)" : ""}, ${formatDate(participant.consents[0].acceptedAt)}` : " · Belum ada bukti persetujuan"}</p></div>{participant.status !== "WITHDRAWN" && participant.status !== "WITHDRAWAL_REQUESTED" && <WithdrawalControl studyId={participant.studyId} status={participant.status} />}</Card>)}</div></section>}
    <Alert variant="info" className="mt-8">ID partisipan pada dataset bersifat pseudonim, bukan anonim: aplikasi tetap menyimpan relasi privat ke akun untuk mengelola persetujuan dan penarikan. Rating penelitian tidak memakai data rating existing atau demo.</Alert>
  </Container>;
}

function Info({ title, body }: { title: string; body: string }) {
  return <div><h3 className="mb-1 text-sm font-bold text-gray-900">{title}</h3><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-secondary">{body}</p></div>;
}
