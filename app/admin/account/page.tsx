import { redirect } from "next/navigation";

export default function AdminAccountRedirect() {
  redirect("/admin/access");
}
