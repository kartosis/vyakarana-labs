/** @jsxImportSource preact */
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { getConfig } from "../lib/config";
import { maybeSignedIn, signOut } from "../lib/auth";
import { api, ApiError, tz } from "../lib/api";

interface Me { pseudonym: string; settings: { script: string; dailyGoal: number; lbOptIn: boolean }; admin: boolean }
interface Progress {
  lessons: Record<string, { status: string; bestScore?: number; attempts?: number }>;
  streak: { current: number; longest: number };
  today: { items?: number; reviews?: number; correct?: number };
  due: number;
}
type Lesson = { id: string; title: string; module: string };

export default function Dashboard({ lessons }: { lessons: Lesson[] }) {
  const uid = useId();
  const [state, setState] = useState<"loading" | "closed" | "guest" | "ready" | "error">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [prog, setProg] = useState<Progress | null>(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  async function load() {
    const cfg = await getConfig();
    if (!cfg.accounts) return setState("closed");
    if (!maybeSignedIn()) return setState("guest");
    try {
      const [m, p] = await Promise.all([api<Me>("/api/v1/me"), api<Progress>(`/api/v1/progress?tz=${encodeURIComponent(tz())}`)]);
      setMe(m);
      setProg(p);
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return setState("guest");
      setErr(e instanceof Error ? e.message : "Could not load your progress.");
      setState("error");
    }
  }
  useEffect(() => void load(), []);

  async function saveSettings(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    try {
      const m = await api<Me>("/api/v1/me", {
        method: "PATCH",
        body: {
          pseudonym: String(f.get("pseudonym") ?? "").trim() || undefined,
          dailyGoal: Number(f.get("dailyGoal")),
          lbOptIn: f.get("lbOptIn") === "on",
          script: String(f.get("script")),
        },
      });
      setMe({ ...me!, ...m });
      setSaved("Settings saved.");
      try { localStorage.setItem("vl:script", m.settings.script); document.documentElement.dataset.script = m.settings.script; } catch {}
    } catch (e2) {
      setSaved(e2 instanceof Error ? e2.message : "Could not save.");
    }
  }

  const [dataErr, setDataErr] = useState("");
  const [delErr, setDelErr] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setDataErr("");
    let data: unknown;
    try {
      data = await api("/api/v1/me/export");
    } catch {
      setDataErr("Your data could not be downloaded just now. Try again in a minute.");
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "vyakarana-labs-data.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    setDelErr("");
    setDeleting(true);
    try {
      await api("/api/v1/me", { method: "DELETE" });
    } catch {
      // nothing was deleted: say so, and leave the dialog open (external review, P3)
      setDelErr("Your account was not deleted: the server could not be reached. Try again in a minute.");
      setDeleting(false);
      return;
    }
    await signOut();
    location.assign("/");
  }

  if (state === "loading") return <p>Loading your progress…</p>;
  if (state === "closed") return <p>Accounts open with the next release.</p>;
  if (state === "guest") return <p>Sign in to see your progress. <a class="btn" href="/signin/?next=/me/">Sign in</a></p>;
  if (state === "error") return <p role="alert">{err}</p>;

  const done = lessons.filter((l) => prog!.lessons[l.id]?.status === "completed").length;
  const goal = me!.settings.dailyGoal;
  const today = (prog!.today.items ?? 0) + (prog!.today.reviews ?? 0);

  return (
    <div class="dash">
      <section class="dash-stats" aria-label="Summary">
        <p><span class="dash-n">{prog!.streak.current}</span> day streak <span class="dash-sub">longest {prog!.streak.longest}</span></p>
        <p><span class="dash-n">{today}</span> of {goal} today <meter min={0} max={goal} value={Math.min(today, goal)} aria-label="Daily goal" /></p>
        <p><span class="dash-n">{prog!.due}</span> reviews due {prog!.due > 0 && <a href="/review/">Review now</a>}</p>
        <p><span class="dash-n">{done}</span> of {lessons.length} lessons completed</p>
      </section>

      <section aria-labelledby={`${uid}-l`}>
        <h2 id={`${uid}-l`}>Lessons</h2>
        <table class="dash-table">
          <thead><tr><th scope="col">Lesson</th><th scope="col">Status</th><th scope="col">Best</th></tr></thead>
          <tbody>
            {lessons.map((l) => {
              const p = prog!.lessons[l.id];
              return (
                <tr>
                  <td><a href={`/course/${l.id}/`}>{l.title}</a></td>
                  <td>{p ? ({ completed: "✓ completed", practised: "practised", read: "read" } as Record<string, string>)[p.status] : "not started"}</td>
                  <td>{p?.bestScore !== undefined ? `${p.bestScore}%` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby={`${uid}-s`}>
        <h2 id={`${uid}-s`}>Settings</h2>
        <form class="dash-form" onSubmit={saveSettings}>
          <label for={`${uid}-p`}>Leaderboard name</label>
          <input id={`${uid}-p`} name="pseudonym" type="text" defaultValue={me!.pseudonym} minLength={3} maxLength={32} />
          <label for={`${uid}-g`}>Daily goal (questions and reviews)</label>
          <input id={`${uid}-g`} name="dailyGoal" type="number" min={1} max={500} defaultValue={String(goal)} />
          <label for={`${uid}-sc`}>Script for Sanskrit</label>
          <select id={`${uid}-sc`} name="script" defaultValue={me!.settings.script}>
            <option value="deva">Devanagari</option>
            <option value="both">Devanagari with IAST</option>
            <option value="iast">IAST</option>
          </select>
          <label class="dash-check">
            <input name="lbOptIn" type="checkbox" defaultChecked={me!.settings.lbOptIn} /> Show me on the weekly leaderboard
          </label>
          <button class="btn" type="submit">Save settings</button>
          <p role="status" class="dash-saved">{saved}</p>
        </form>
      </section>

      <section aria-labelledby={`${uid}-d`}>
        <h2 id={`${uid}-d`}>Your data</h2>
        <p class="dash-actions">
          <button class="btn btn--quiet" type="button" onClick={exportData}>Download my data</button>
          <button class="btn btn--quiet" type="button" onClick={async () => { await signOut(); location.assign("/"); }}>Sign out</button>
          <button class="btn btn--quiet dash-danger" type="button" onClick={() => dialog.current?.showModal()}>Delete account</button>
        </p>
        {dataErr && <p class="dash-error" role="alert">{dataErr}</p>}
        <dialog ref={dialog} class="dash-dialog" aria-labelledby={`${uid}-dd`}>
          <h3 id={`${uid}-dd`}>Delete your account?</h3>
          <p>This removes your progress, reviews, streak and leaderboard entries. It cannot be undone.</p>
          {delErr && <p class="dash-error" role="alert">{delErr}</p>}
          <form method="dialog" class="dash-actions">
            <button class="btn btn--quiet" value="cancel">Keep my account</button>
            <button class="btn dash-danger" type="button" onClick={deleteAccount} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete everything"}
            </button>
          </form>
        </dialog>
      </section>
    </div>
  );
}
