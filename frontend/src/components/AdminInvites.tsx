import React, { useMemo, useState } from "react";
import { createInvite } from "../lib/api";

type Props = {
  teamId: string;
};

export function AdminInvites({ teamId }: Props) {
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [busy, setBusy] = useState<"viewer" | "uploader" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [lastLink, setLastLink] = useState<{ role: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const expiryOptions = useMemo(() => [7, 14, 30, 90, 180, 365], []);

  async function make(role: "viewer" | "uploader") {
    try {
      setErr(null);
      setCopied(false);
      setBusy(role);

      const res = await createInvite({ team_id: teamId, role, expires_in_days: expiresInDays });
      setLastLink({ role: res.role, url: res.invite_url });
    } catch (ex: any) {
      setErr(ex?.message || "Failed to create invite");
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="rowBetween">
        <h2 style={{ margin: 0 }}>Invite Links</h2>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Expires</span>
          <select
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
            className="select"
            aria-label="expires-in-days"
          >
            {expiryOptions.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Share these links in TeamSnap/SportsEngine chat. Anyone with the link can access based on role.
      </div>

      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="btn primary"
          onClick={() => make("viewer")}
          disabled={busy !== null}
        >
          {busy === "viewer" ? "Creating…" : "Create Viewer Link"}
        </button>

        <button
          className="btn"
          onClick={() => make("uploader")}
          disabled={busy !== null}
        >
          {busy === "uploader" ? "Creating…" : "Create Uploader Link"}
        </button>
      </div>

      {err ? <div className="error">{err}</div> : null}

      {lastLink ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            Last created: <b>{lastLink.role}</b>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
            <input className="input" value={lastLink.url} readOnly />
            <button className="btn primary" onClick={() => copy(lastLink.url)}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Tip: Use Viewer for most parents. Use Uploader for coaches or trusted parents.
          </div>
        </div>
      ) : null}
    </div>
  );
}
