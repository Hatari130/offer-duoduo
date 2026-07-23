export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request);
    const acceptsHtml = (request.headers.get("accept") || "").includes(
      "text/html"
    );
    if (response.status === 404 && request.method === "GET" && acceptsHtml) {
      const fallbackUrl = new URL("/index.html", request.url);
      response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const imageUrl = new URL("/og.png", request.url).href;
    return new Response(
      html.replaceAll("__OFFERFLOW_OG_IMAGE__", imageUrl),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      }
    );
  }
};
