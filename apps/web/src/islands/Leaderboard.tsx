/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { getConfig } from "../lib/config";
import { api } from "../lib/api";

type Row = { rank: number; pseudonym: string; score: number };

export default function Leaderboard() {
  const [state, setState] = useState<"loading" | "closed" | "ready" | "error">("loading");
  const [week, setWeek] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      if (!(await getConfig()).accounts) return setState("closed");
      try {
        const r = await api<{ week: string; rows: Row[] }>("/api/v1/leaderboard/current", { auth: false });
        setWeek(r.week);
        setRows(r.rows);
        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, []);
  if (state === "loading") return <p>Loading…</p>;
  if (state === "closed") return <p>The leaderboard starts when accounts launch.</p>;
  if (state === "error") return <p role="alert">The leaderboard could not be loaded.</p>;
  if (!rows.length) return <p>No one has practised yet this week ({week}). The first session takes the top spot.</p>;
  return (
    <table class="lb-table">
      <caption>Week {week}. Points: one per correct answer or remembered review, ten for completing a lesson.</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Learner</th><th scope="col">Points</th></tr></thead>
      <tbody>{rows.map((r) => <tr><td>{r.rank}</td><td>{r.pseudonym}</td><td>{r.score}</td></tr>)}</tbody>
    </table>
  );
}
