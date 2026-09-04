import { redirect } from "next/navigation";

/** Teachers now live under Access → Teachers. */
export default function AdminFinanceTeachersRedirect() {
  redirect("/admin/access?staff=teachers");
}
