import type { Metadata } from "next";

import { redirect } from "next/navigation";

import {

  getAdminGalleryCounts,

  listAdminGalleryPage,

  type AdminGalleryTab,

} from "@/app/admin/gallery/actions";

import { AdminGalleryManager } from "@/components/admin/gallery-manager";

import { getSessionAdmin, isNationalAdmin } from "@/lib/admin/auth";

import { GALLERY_PAGE_SIZE } from "@/lib/gallery/constants";

import {

  publicActionMessage,

  publicUnavailableMessage,

} from "@/lib/safe-action-message";

import { deskPageFromSearchParams } from "@/lib/ui/desk-page";



export const metadata: Metadata = {

  title: "Gallery | School of Disciples Portal",

};



type PageProps = {

  searchParams?: Promise<Record<string, string | string[] | undefined>>;

};



function tabFromParams(raw: string | string[] | undefined): AdminGalleryTab {

  const value = typeof raw === "string" ? raw : "";

  if (value === "flagged" || value === "taken_down") return value;

  return "all";

}



export default async function AdminGalleryPage({ searchParams }: PageProps) {

  const profile = await getSessionAdmin();

  if (!profile) redirect("/login/admin");



  const params = searchParams ? await searchParams : {};

  const tab = tabFromParams(params.tab);

  const page = deskPageFromSearchParams(params.page);

  const search =

    typeof params.q === "string" ? params.q.trim() || null : null;

  const openId = typeof params.open === "string" ? params.open : null;



  let galleryPage: Awaited<ReturnType<typeof listAdminGalleryPage>> = {

    items: [],

    total: 0,

    page: 1,

    pageSize: GALLERY_PAGE_SIZE,

  };

  let counts: Awaited<ReturnType<typeof getAdminGalleryCounts>> = {

    all: 0,

    flagged: 0,

    takenDown: 0,

  };

  let loadError: string | null = null;



  try {

    [galleryPage, counts] = await Promise.all([

      listAdminGalleryPage({ tab, page, search }),

      getAdminGalleryCounts(),

    ]);

  } catch (error) {

    console.error("[admin/gallery]", error);

    loadError = publicActionMessage(

      error,

      publicUnavailableMessage("Gallery"),

    );

  }



  return (

    <div className="mx-auto max-w-6xl">

      <section className="animate-fade-rise mb-4 sm:mb-6">

        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">

          Portraits

        </p>

        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">

          Gallery desk

        </h1>

        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">

          {isNationalAdmin(profile)

            ? "Review graduation selfies across the network. Flag, take down with a reason, or delete."

            : "Review graduation selfies for your parish. Flag, take down with a reason, or delete."}

        </p>

      </section>



      {loadError ? (

        <div

          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"

          role="alert"

        >

          {loadError}

        </div>

      ) : (

        <AdminGalleryManager

          items={galleryPage.items}

          total={galleryPage.total}

          page={galleryPage.page}

          pageSize={galleryPage.pageSize}

          tab={tab}

          search={search ?? ""}

          openId={openId}

          counts={counts}

          national={isNationalAdmin(profile)}

        />

      )}

    </div>

  );

}

