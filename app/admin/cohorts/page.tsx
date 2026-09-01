import { redirect } from "next/navigation";

/** Cohorts desk folded into Students — keep URL for old bookmarks. */
export default function AdminCohortsPage() {
  redirect("/admin/students");
}
