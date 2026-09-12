"use server";

import { revalidatePath } from "next/cache";
import {
  COMMUNITY_BODY_MAX,
  type CommunityMessage,
} from "@/lib/community/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { requireSessionStudent } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CommunityActionResult = {
  ok: boolean;
  message: string;
  posted?: CommunityMessage;
};

export async function listStudentCommunityMessages(): Promise<
  CommunityMessage[]
> {
  await requireSessionStudent();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("community_messages")
    .select(
      "id, body, author_user_id, author_kind, author_label, is_hidden, created_at",
    )
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[community list student]", error.message);
    return [];
  }
  return (data ?? []) as CommunityMessage[];
}

export async function postStudentCommunityMessage(
  bodyRaw: string,
): Promise<CommunityActionResult> {
  try {
    const profile = await requireSessionStudent();
    const body = bodyRaw.trim();
    if (!body) return { ok: false, message: "Message cannot be empty." };
    if (body.length > COMMUNITY_BODY_MAX) {
      return { ok: false, message: "Message is too long." };
    }

    const label =
      `${profile.first_name} ${profile.last_name}`.trim() || "Student";

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("community_messages")
      .insert({
        body,
        author_user_id: profile.id,
        author_kind: "student",
        author_label: label,
      })
      .select(
        "id, body, author_user_id, author_kind, author_label, is_hidden, created_at",
      )
      .single();

    if (error || !data) {
      console.error("[community post student]", error?.message);
      return {
        ok: false,
        message: publicActionMessage(error?.message, "Could not send message."),
      };
    }

    revalidatePath("/student/community");
    return {
      ok: true,
      message: "Message sent.",
      posted: data as CommunityMessage,
    };
  } catch (error) {
    console.error("[community post student]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not send message."),
    };
  }
}

export async function fetchCommunityMessageById(
  id: string,
): Promise<CommunityMessage | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("community_messages")
    .select(
      "id, body, author_user_id, author_kind, author_label, is_hidden, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as CommunityMessage | null) ?? null;
}
