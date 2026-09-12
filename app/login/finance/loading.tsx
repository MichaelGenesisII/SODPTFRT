import type { Metadata } from "next";
import { PortalLoadingScreen } from "@/components/ui/portal-loading-screen";

export const metadata: Metadata = {
  title: "Finance Sign In | School of Disciples Portal",
};

export default function FinanceLoginLoading() {
  return <PortalLoadingScreen label="Loading sign-in…" />;
}
