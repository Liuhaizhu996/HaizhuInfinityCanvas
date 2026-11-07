/**
 * `.hzcanvas` formatVersion. Stays on 1.0.0-beta.1 so existing documents
 * still open. The product version lives in the repository VERSION file.
 */
export const GRAPH_DOCUMENT_VERSION = "1.0.0-beta.1";

export const HZCANVAS_FORMAT = "hzcanvas" as const;

/** Download / open file suffix. The file body is UTF-8 JSON. */
export const HZCANVAS_EXTENSION = ".hzcanvas";

/**
 * Sibling folder suffix.
 * `Demo.hzcanvas` stores bytes in `Demo.hzcanvas.assets/`.
 */
export const HZCANVAS_ASSETS_SUFFIX = ".assets";

export const PORT_DATA_TYPES = ["text", "image", "video", "audio", "storyboard"] as const;
