/** Runtime configuration written to /config.json at deploy time (Terraform output web_config). */
export interface WebConfig {
  accounts: boolean;
  region: string;
  userPoolId: string | null;
  clientId: string | null;
}

let cached: Promise<WebConfig> | null = null;

export function getConfig(): Promise<WebConfig> {
  cached ??= fetch("/config.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<WebConfig>) : Promise.reject(new Error(String(r.status)))))
    .catch(() => ({ accounts: false, region: "us-east-1", userPoolId: null, clientId: null }));
  return cached;
}
