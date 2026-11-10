import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Container } from "@/components/ui";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-white py-8">
      <Container className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-gray-900"><UtensilsCrossed size={17} className="text-primary" aria-hidden="true" /> FoodRec</Link>
        <p className="m-0 text-xs leading-5 text-secondary">Rekomendasi makanan disusun dari pola rating dan tampil setelah diterbitkan.</p>
        <span className="text-xs text-gray-400">© {new Date().getFullYear()} FoodRec</span>
      </Container>
    </footer>
  );
}
