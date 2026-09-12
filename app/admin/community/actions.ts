"use server";

import { revalidatePath } from "next/cache";
import {
  COMMUNITY_BODY_MAX,
  LISTENING_DESK_LABEL,
  type CommunityMessage,
} from "@/lib/community/types";
import { requireSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CommunityAdminActionResult = {
  ok: boolean;
  message: string;
};

export async function listAdminCommunityMessages(): Promise<CommunityMessage[]> {
  await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("community_messages")
    .select(
      "id, body, author_user_id, author_kind, author_label, is_hidden, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error("[community list admin]", error.message);
    return [];
  }
  return (data ?? []) as CommunityMessage[];
}

export async function postDeskCommunityMessage(
  bodyRaw: string,
): Promise<CommunityAdminActionResult> {
  try {
    const admin = await requireSessionAdmin();
    if (!isNationalAdmin(admin)) {
      return {
        ok: false,
        message: "Only the national desk can post in Community.",
      };
    }
    const body = bodyRaw.trim();
    if (!body) return { ok: false, message: "Message cannot be empty." };
    if (body.length > COMMUNITY_BODY_MAX) {
      return { ok: false, message: "Message is too long." };
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("community_messages").insert({
      body,
      author_user_id: admin.id,
      author_kind: "admin",
      author_label: LISTENING_DESK_LABEL,
    });

    if (error) {
      console.error("[community post desk]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not send message."),
      };
    }

    revalidatePath("/admin/community");
    revalidatePath("/student/community");
    return { ok: true, message: "Posted as Listening Desk." };
  } catch (error) {
    console.error("[community post desk]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not send message."),
    };
  }
}

export async function hideCommunityMessage(
  messageId: string,
): Promise<CommunityAdminActionResult> {
  try {
    const admin = await requireSessionAdmin();
    if (!isNationalAdmin(admin)) {
      return {
        ok: false,
        message: "Only the national desk can moderate Community.",
      };
    }
    if (!messageId) return { ok: false, message: "Message not found." };

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("community_messages")
      .update({
        is_hidden: true,
        hidden_by: admin.id,
        hidden_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    if (error) {
      console.error("[community hide]", error.message);
      return {
        ok: false,
        message: publicActionMessage(error.message, "Could not hide message."),
      };
    }

    revalidatePath("/admin/community");
    revalidatePath("/student/community");
    return { ok: true, message: "Message hidden." };
  } catch (error) {
    console.error("[community hide]", error);
    return {
      ok: false,
      message: publicActionMessage(error, "Could not hide message."),
    };
  }
}
