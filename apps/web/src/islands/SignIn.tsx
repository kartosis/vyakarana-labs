/** @jsxImportSource preact */
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { getConfig } from "../lib/config";
import { AuthError, confirmCode, loadPending, requestCode, safeNext, savePending, type Pending } from "../lib/auth";
import { api } from "../lib/api";

type Step = "loading" | "closed" | "email" | "code" | "done";

/** Move "mark as read" history from this browser into the new account (server data wins). */
async function mergeGuestProgress() {
  try {
    const read = JSON.parse(localStorage.getItem("vl:read") ?? "[]") as string[];
    if (read.length) await api("/api/v1/progress/merge", { method: "POST", body: { read } });
  } catch {}
}

export default function SignIn() {
  const id = useId();
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getConfig().then((c) => {
      if (!c.accounts) return setStep("closed");
      // a reload in the middle of signing in: carry on where the learner was (external review #5)
      const p = loadPending();
      if (p) {
        setPending(p);
        setEmail(p.email);
        setStep("code");
      } else setStep("email");
    });
  }, []);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);


  async function onEmail(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await requestCode(email);
      setPending(p);
      savePending(p);
      setStep("code");
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Could not send a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onCode(e: Event) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await confirmCode(pending, code);
      savePending(null);
      await mergeGuestProgress();
      setStep("done");
      location.assign(safeNext(location.search, location.origin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") return <p class="signin-status">Checking…</p>;
  if (step === "closed")
    return (
      <p class="signin-status" role="status">
        Accounts open with the next release. Every lesson and tool works without one in the meantime, and anything you mark as
        read is kept in this browser and moved into your account when you first sign in.
      </p>
    );

  return (
    <div class="signin">
      {step === "email" && (
        <form onSubmit={onEmail} aria-describedby={error ? `${id}-err` : undefined}>
          <label for={`${id}-email`}>Email address</label>
          <input
            id={`${id}-email`}
            type="email"
            required
            autocomplete="email"
            inputmode="email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <button class="btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}
      {step === "code" && pending && (
        <form onSubmit={onCode} aria-describedby={`${id}-sent${error ? ` ${id}-err` : ""}`}>
          <p id={`${id}-sent`} class="signin-sent">
            We sent a 6-digit code to <strong>{pending.email}</strong>. It can take a minute to arrive; check spam if it does not.
          </p>
          <label for={`${id}-code`}>Code</label>
          <input
            id={`${id}-code`}
            ref={codeRef}
            type="text"
            required
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6,8}"
            maxLength={8}
            value={code}
            onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ""))}
          />
          <button class="btn" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            class="btn btn--quiet"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const p = await requestCode(pending.email);
                setPending(p);
                savePending(p);
                setCode("");
              } catch (err) {
                setError(err instanceof AuthError ? err.message : "Could not send a code. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send a new code
          </button>
          <button
            type="button"
            class="btn btn--quiet"
            onClick={() => {
              savePending(null);
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
      {step === "done" && <p role="status">Signed in. Taking you on…</p>}
      {error && (
        <p id={`${id}-err`} class="signin-error" role="alert">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}
    </div>
  );
}
