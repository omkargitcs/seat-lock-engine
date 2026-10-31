import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../utils/AuthContext";

function Stub() {
  return (
    <div className="auth-stub" aria-hidden="true">
      <div className="auth-stub-main">
        <span className="eyebrow">Admit two</span>
        <strong>Neon District</strong>
        <span className="mono">Sat · 9:00 PM · Row F · Seats 7, 8</span>
      </div>
      <div className="auth-stub-tear"><span className="mono">SD-7K3M9QXA</span></div>
    </div>
  );
}

export default function Auth({ mode }) {
  const isLogin = mode === "login";
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-aside">
        <Link to="/" className="brand"><Logo size={32} /><span>SeatDrop</span></Link>
        <div>
          <h2>Pick your seat. Keep it while you pay.</h2>
          <p>Live seat maps for movies, concerts, comedy, sports and theatre. When you choose a seat, it's yours for five minutes, and no one else can take it.</p>
        </div>
        <Stub />
      </aside>

      <main className="auth-main">
        <div className="auth-theme"><ThemeToggle /></div>
        <form className="auth-form" onSubmit={submit}>
          <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="muted">{isLogin ? "Sign in to book seats and see your tickets." : "It takes a minute. No payment details needed."}</p>

          {error && <p className="notice-error" role="alert">{error}</p>}

          {!isLogin && (
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="field" required minLength={2} maxLength={60} autoComplete="name" value={form.name} onChange={set("name")} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="field" required autoComplete="email" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" className="field" required minLength={isLogin ? 1 : 8} maxLength={72} autoComplete={isLogin ? "current-password" : "new-password"} value={form.password} onChange={set("password")} />
            {!isLogin && <p className="hint">At least 8 characters.</p>}
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : isLogin ? "Sign in" : "Create account"}
          </button>

          {import.meta.env.DEV && isLogin && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setForm({ name: "", email: "demo@seatdrop.dev", password: "Demo@12345" })}>
              Fill demo account (dev only)
            </button>
          )}

          <p className="auth-switch">
            {isLogin ? <>New to SeatDrop? <Link to="/register" state={location.state}>Create an account</Link></>
                     : <>Already have an account? <Link to="/login" state={location.state}>Sign in</Link></>}
          </p>
        </form>
      </main>
    </div>
  );
}
