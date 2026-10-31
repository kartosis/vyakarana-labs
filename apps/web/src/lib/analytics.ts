/**
 * Cookieless page analytics (Cloudflare Web Analytics), external review #19.
 *
 * The token comes from the repository variable CF_BEACON_TOKEN, which deploy.yml passes both to this build
 * (as PUBLIC_CF_BEACON_TOKEN) and to Terraform (which then allows the beacon's two hosts in the CSP), so the
 * tag and the CSP always switch on and off together. Empty → no beacon on any page.
 */
const raw = (import.meta.env.PUBLIC_CF_BEACON_TOKEN ?? "").trim();
if (raw && !/^[0-9a-f]{32}$/.test(raw)) {
  throw new Error("PUBLIC_CF_BEACON_TOKEN must be the 32-character hexadecimal Cloudflare Web Analytics token");
}
export const beaconToken: string = raw;
