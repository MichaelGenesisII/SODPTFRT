export const SOD_SITE = "https://schoolofdisciples.org";

export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
  children?: NavItem[];
};

/** Most items point back to the public School of Disciples site. */
export const loginNav: NavItem = {
  label: "Login",
  href: "/login/student",
  children: [
    { label: "Student", href: "/login/student" },
    { label: "Alumni", href: "/login/alumni" },
    { label: "Admin", href: "/login/admin" },
  ],
};

export const primaryNav: NavItem[] = [
  { label: "Home", href: `${SOD_SITE}/`, external: true },
  {
    label: "Testimonials",
    href: `${SOD_SITE}/testimonials/`,
    external: true,
  },
  { label: "Support", href: "/support" },
  { label: "Donate", href: `${SOD_SITE}/donate/`, external: true },
];

export const footerExplore: NavItem[] = [
  { label: "About", href: `${SOD_SITE}/about/`, external: true },
  { label: "Donate", href: `${SOD_SITE}/donate/`, external: true },
  { label: "Enrol Now", href: "/enrol" },
  { label: "Support", href: "/support" },
];

export const enrolHref = "/enrol";
export const supportHref = "/support";
export const contactHref = "/support";

export const contact = {
  addressLines: ["3-5 Bradbury Place, Belfast", "BT7 1RQ, United Kingdom"],
  phone: "+44 7535 687400",
  phoneHref: "tel:+447535687400",
  email: "info@schoolofdisciples.org",
  emailHref: "mailto:info@schoolofdisciples.org",
};
