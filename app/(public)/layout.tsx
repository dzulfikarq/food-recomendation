import type { ReactNode } from "react";
import { PublicFooter } from "@/components/site/public-footer";
import { PublicHeader } from "@/components/site/public-header";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <><PublicHeader /><main className="min-h-[calc(100vh-76px)]">{children}</main><PublicFooter /></>;
}
