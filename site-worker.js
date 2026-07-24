const EMBEDDED_FILES = __OFFERFLOW_EMBEDDED_FILES__;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function resolvePath(request) {
  const url = new URL(request.url);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = url.pathname;
  }

  if (pathname === "/" || pathname === "/dashboard") return "/index.html";
  return pathname;
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" }
      });
    }

    let pathname = resolvePath(request);
    let file = EMBEDDED_FILES[pathname];
    const acceptsHtml = (request.headers.get("accept") || "").includes(
      "text/html"
    );

    if (!file && acceptsHtml) {
      pathname = "/index.html";
      file = EMBEDDED_FILES[pathname];
    }

    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers({
      "Content-Type": file.contentType,
      "Cache-Control": pathname.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    });

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    const bytes = decodeBase64(file.body);
    if (!file.contentType.startsWith("text/html")) {
      return new Response(bytes, { status: 200, headers });
    }

    const html = new TextDecoder().decode(bytes);
    const imageUrl = new URL("/og-v2.png", request.url).href;
    return new Response(
      html.replaceAll("__OFFERFLOW_OG_IMAGE__", imageUrl),
      { status: 200, headers }
    );
  }
};
