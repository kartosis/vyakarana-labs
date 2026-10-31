// CloudFront Function (cloudfront-js-2.0), viewer-request. Plain ES5 for portability.
// Astro builds /course/x/index.html; map clean URLs onto those objects.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf("/api/") === 0) return request;
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
    return request;
  }
  // A file has an extension starting with a letter (.html, .js, .woff2); /sutra/1.3.3 is a page.
  var last = uri.substring(uri.lastIndexOf("/") + 1);
  if (!/\.[a-z][a-z0-9]{0,4}$/i.test(last)) {
    // No extension in the last segment: redirect to the trailing-slash form (keeps the query).
    var qs = [];
    for (var k in request.querystring) {
      var v = request.querystring[k];
      qs.push(encodeURIComponent(k) + (v.value ? "=" + encodeURIComponent(v.value) : ""));
    }
    // Collapse leading slashes and backslashes: "//host/x" or "/\\host/x" in Location would leave the site.
    var path = "/" + uri.replace(/^[\/\\]+/, "");
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: path + "/" + (qs.length ? "?" + qs.join("&") : "") } },
    };
  }
  return request;
}
