import type { Metadata } from "next";
import { PortalLoadingScreen } from "@/components/ui/portal-loading-screen";

export const metadata: Metadata = {
  title: "Teacher Sign In | School of Disciples Portal",
};

export default function TeacherLoginLoading() {
  return <PortalLoadingScreen label="Loading sign-in…" />;
}
