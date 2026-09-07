import { redirect } from "next/navigation";

/** Finance staff invites live under Access → Finance. */
export default function AdminFinanceRedirect() {
  redirect("/admin/access?staff=finance");
}
