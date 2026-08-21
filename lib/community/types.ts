export type CommunityAuthorKind = "student" | "admin";

export type CommunityMessage = {
  id: string;
  body: string;
  author_user_id: string;
  author_kind: CommunityAuthorKind;
  author_label: string;
  is_hidden: boolean;
  created_at: string;
};

export const COMMUNITY_BODY_MAX = 2000;

export const LISTENING_DESK_LABEL = "Listening Desk";
