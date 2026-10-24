import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-soft hover:text-orange-900 focus-visible:outline-2 focus-visible:outline-primary">
        <LogOut size={16} aria-hidden="true" /><span className="hidden sm:inline">Keluar</span>
      </button>
    </form>
  );
}
