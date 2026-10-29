/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { getConfig } from "../lib/config";
import { maybeSignedIn } from "../lib/auth";
import { api, ApiError, tz } from "../lib/api";
import { Rich } from "./rich";

type Card = { front: string; back: string; lesson: string };
type Due = { cardId: string; lesson: string };
const RATINGS = [
  { value: 1, label: "Again", hint: "forgot" },
  { value: 2, label: "Hard", hint: "remembered with effort" },
  { value: 3, label: "Good", hint: "remembered" },
  { value: 4, label: "Easy", hint: "instant" },
] as const;

/** Spaced repetition: the server schedules each card with FSRS; this island only shows and rates. */
export default function ReviewSession({ cards }: { cards: Record<string, Card> }) {
  const [state, setState] = useState<"loading" | "closed" | "guest" | "empty" | "front" | "back" | "saving" | "done" | "error">("loading");
  const [queue, setQueue] = useState<Due[]>([]);
  const [i, setI] = useState(0);
  const [ratings, setRatings] = useState<Array<{ cardId: string; rating: number; ms: number }>>([]);
  const [msg, setMsg] = useState("");
  const shownAt = useRef(0);
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (async () => {
      const cfg = await getConfig();
      if (!cfg.accounts) return setState("closed");
      if (!maybeSignedIn()) return setState("guest");
      try {
        const r = await api<{ cards: Due[] }>("/api/v1/reviews/due?limit=40");
        const known = r.cards.filter((c) => cards[c.cardId]);
        setQueue(known);
        setState(known.length ? "front" : "empty");
        shownAt.current = performance.now();
      } catch (e) {
        setMsg(e instanceof ApiError ? e.message : "Could not load reviews.");
        setState(e instanceof ApiError && e.status === 401 ? "guest" : "error");
      }
    })();
  }, []);
  useEffect(() => focusRef.current?.focus(), [state, i]);

  async function rate(value: number) {
    const ms = Math.round(performance.now() - shownAt.current);
    const next = [...ratings, { cardId: queue[i]!.cardId, rating: value, ms }];
    setRatings(next);
    if (i + 1 < queue.length) {
      setI(i + 1);
      setState("front");
      shownAt.current = performance.now();
      return;
    }
    setState("saving");
    try {
      await api("/api/v1/reviews", { method: "POST", body: { items: next, tz: tz() } });
      setState("done");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save your reviews.");
      setState("error");
    }
  }

  if (state === "loading") return <p class="review-note">Loading your reviews…</p>;
  if (state === "closed") return <p class="review-note">Reviews open when accounts launch.</p>;
  if (state === "guest")
    return (
      <p class="review-note">
        Reviews are scheduled for your account. <a class="btn" href="/signin/?next=/review/">Sign in</a>
      </p>
    );
  if (state === "empty")
    return (
      <p class="review-note">
        Nothing is due. Complete a lesson's practice to add cards, or come back later: each card returns just before you would
        forget it.
      </p>
    );
  if (state === "saving") return <p class="review-note" role="status">Saving…</p>;
  if (state === "error") return <p class="review-note" role="alert">{msg}</p>;
  if (state === "done")
    return (
      <div class="review-note" role="status">
        <p>
          <strong>{ratings.length} reviewed.</strong> {ratings.filter((r) => r.rating >= 3).length} remembered. Each card's next
          date has been set.
        </p>
        <p><a href="/me/">See your progress</a></p>
      </div>
    );

  const card = cards[queue[i]!.cardId]!;
  return (
    <div class="review-card" aria-live="polite">
      <p class="review-count">Card {i + 1} of {queue.length}</p>
      <div class="review-face">
        <p class="review-front"><Rich text={card.front} /></p>
        {state === "back" && <p class="review-back"><Rich text={card.back} /></p>}
      </div>
      {state === "front" ? (
        <button ref={focusRef} class="btn" type="button" onClick={() => setState("back")}>Show answer</button>
      ) : (
        <div class="review-rate" role="group" aria-label="How well did you remember?">
          {RATINGS.map((r, k) => (
            <button
              ref={k === 2 ? focusRef : undefined}
              type="button"
              class={`btn ${k === 2 ? "" : "btn--quiet"}`}
              onClick={() => rate(r.value)}
            >
              {r.label}
              <span class="review-hint">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
