// Tests for the CloudFront viewer-request function. Run: node --test infra/terraform/modules/site/rewrite.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./rewrite.js", import.meta.url), "utf8");
const handler = new Function(`${src}; return handler;`)();
const req = (uri, querystring = {}) => handler({ request: { uri, querystring } });

test("a directory URL serves its index.html", () => {
  assert.equal(req("/course/").uri, "/course/index.html");
  assert.equal(req("/").uri, "/index.html");
});

test("files and the API pass through unchanged", () => {
  assert.equal(req("/_astro/app.abc123.js").uri, "/_astro/app.abc123.js");
  assert.equal(req("/vidyut/vidyut_prakriya_bg.wasm").uri, "/vidyut/vidyut_prakriya_bg.wasm");
  assert.equal(req("/api/v1/me").uri, "/api/v1/me");
});

test("a page URL without the slash redirects to it, keeping the query", () => {
  const r = req("/tools/sandhi", { a: { value: "rāma" }, b: { value: "" } });
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "/tools/sandhi/?a=r%C4%81ma&b");
  assert.equal(req("/sutra/1.3.3").headers.location.value, "/sutra/1.3.3/");
});

test("never redirects off-site (external review: protocol-relative Location)", () => {
  for (const uri of ["//example.org/course", "///example.org/course", "/\\example.org/course", "/\\/example.org/x"]) {
    const loc = req(uri).headers.location.value;
    assert.ok(loc.startsWith("/") && !/^[/\\]{2}/.test(loc), `${uri} → ${loc}`);
    assert.equal(new URL(loc, "https://site.test").origin, "https://site.test", `${uri} → ${loc}`);
  }
});
