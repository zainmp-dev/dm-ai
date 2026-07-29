/**
 * OfficeKit HR blog tokens — extracted from officekithr.com/resources/blogs.
 * @see https://www.officekithr.com/resources/blogs
 */
export const OK = {
  primary: "#0055FF",
  primaryHover: "#0044CC",
  primaryActive: "#003db3",
  foreground: "#21232C",
  mutedForeground: "#515E70",
  mutedBg: "#F3F5F7",
  border: "#E2E4E9",
  pageBg: "#FAFAFA",
  cardBg: "#FFFFFF",
  primaryLight: "#E5EEFF",
  bodyText: "#333333",
  whatsapp: "#25D366",
} as const;

/** System UI stack used on OfficeKit (not Inter/Geist). */
export const OK_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const OK_BLOG_ROOT = "officekit-blog";

/** OfficeKit --radius: 0.5rem (8px) on blog cards */
export const OK_CARD_RADIUS = "rounded-[0.5rem]";

export const OK_PAGE_CANVAS = "bg-white py-12 sm:py-16 lg:py-20";

export const OK_PAGE_CANVAS_INNER = "container mx-auto px-4 sm:px-6";

export const OK_BLOG_GRID_CONTAINER = "mx-auto max-w-6xl";

export const OK_BLOG_GRID = "grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3";

/** Matches officekithr.com blog listing cards (shadow-medium + hover:shadow-lg). */
export const OK_BLOG_CARD =
  "flex h-full flex-col overflow-hidden rounded-lg border border-[#E2E4E9] bg-white text-[#21232C] shadow-[0_10px_30px_-5px_rgba(0,85,255,0.15)] transition-shadow duration-300 group-hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]";

export const OK_CARD =
  "flex h-full flex-col overflow-hidden border border-[#E2E4E9] bg-white text-[#21232C] shadow-[0_4px_20px_-2px_rgba(0,85,255,0.1)] transition-shadow duration-300 hover:shadow-[0_10px_30px_-5px_rgba(0,85,255,0.15)] dark:bg-white dark:text-[#21232C]";

export const OK_STAT_CARD =
  "block border border-[#E2E4E9] bg-white text-[#21232C] shadow-[0_4px_20px_-2px_rgba(0,85,255,0.1)] transition-shadow duration-300 hover:shadow-[0_10px_30px_-5px_rgba(0,85,255,0.15)]";

export const OK_PRIMARY_BTN =
  "bg-[#0055FF] text-white hover:bg-[#0044CC] active:bg-[#003db3] dark:bg-[#0055FF] dark:hover:bg-[#0044CC]";

export const OK_OUTLINE_BTN =
  "border-[#E2E4E9] bg-white text-[#515E70] hover:border-[#0055FF]/30 hover:bg-[#F3F5F7] hover:text-[#21232C]";

export const OK_PREVIEW_BAR =
  "border-b border-[#E2E4E9] bg-[#ffffff]";

export const OK_PREVIEW_PAGE_BG = "bg-[#ffffff]";

export const OK_PREVIEW_BACK_BTN =
  "inline-flex items-center gap-2 rounded-lg border border-[#b7c9fa] bg-[#eef0f9] px-4 py-2 text-sm font-semibold text-[#0055ff] transition-colors hover:border-[#0055ff]/50 hover:bg-[#e5eeff] hover:text-[#0044cc]";

export const OK_PREVIEW_STATUS =
  "inline-flex items-center gap-2 text-sm text-[#515E70]";

export const OK_BACK_LINK =
  "inline-flex items-center gap-2 rounded-lg border border-[#b7c9fa] bg-[#eef0f9] px-4 py-2 text-sm font-semibold text-[#0055ff] transition-colors hover:border-[#0055ff]/50 hover:bg-[#e5eeff] hover:text-[#0044cc]";

export const OK_ARTICLE_IMAGE_RADIUS = "rounded-xl";

export const OK_ARTICLE_CATEGORY =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-[#515E70]";

export const OK_TEXT_LINK =
  "font-medium text-[#0055FF] transition-colors hover:text-[#0044CC] hover:underline";

export const OK_TAB_ACTIVE = "border-[#0055FF] text-[#0055FF]";
export const OK_PILL_ACTIVE =
  "border-[#0055FF] bg-[#0055FF] text-white hover:bg-[#0044CC] hover:text-white";
export const OK_PILL_INACTIVE =
  "border-[#E2E4E9] bg-white text-[#515E70] hover:border-[#0055FF]/30 hover:text-[#21232C]";

export const OK_CATEGORY_PILL =
  "inline-flex items-center gap-1 rounded-full bg-[#F3F5F7] px-2 py-0.5 text-xs text-[#515E70]";

export const OK_BLOG_CARD_TITLE =
  "mb-2 line-clamp-2 text-base font-semibold text-[#21232C] transition-colors group-hover:text-[#0055FF] sm:text-lg";

export const OK_BLOG_CARD_EXCERPT = "mb-4 line-clamp-2 flex-grow text-sm text-[#515E70]";

export const OK_BLOG_CARD_FOOTER =
  "flex items-center justify-between border-t border-[#E2E4E9]/60 pt-2 text-xs text-[#515E70]";

export const OK_ARTICLE_TITLE =
  "text-3xl font-bold leading-tight tracking-tight text-[#21232C] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]";

export const OK_ARTICLE_META = "text-sm text-[#515E70]";

export const OK_SECTION_TITLE = "text-2xl font-bold text-[#21232C] sm:text-3xl";
