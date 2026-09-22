/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Injected by astro:config:setup; sync is reserved for offline type checks. */
  readonly BLOG_CONTENT_PHASE?: string;
}
