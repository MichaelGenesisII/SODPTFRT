import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "History | Teacher Portal",
};

/** History now lives under Classes — keep old links working. */
export default function TeacherHistoryPage() {
  redirect("/teacher/classes?panel=history");
}
