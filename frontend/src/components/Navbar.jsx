import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LogOut, MapPin, Search, ShieldCheck, Ticket, User } from "lucide-react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../utils/AuthContext";
import { api } from "../utils/api";
import { setCity, useCity } from "../utils/city";

function CitySelect({ cities }) {
  const city = useCity();
  return (
    <label className="city-select">
      <MapPin size={15} aria-hidden="true" />
      <span className="sr-only">City</span>
      <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

function AccountMenu({ placement = "down", children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (to) => () => { setOpen(false); navigate(to); };

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {children}
      </button>
      {open && (
        <div role="menu" className={`menu pop menu-${placement}`}>
          <div className="menu-head">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
          </div>
          <button role="menuitem" type="button" onClick={go("/bookings")}><Ticket size={16} /> My tickets</button>
          {user.role === "admin" && <button role="menuitem" type="button" onClick={go("/admin")}><ShieldCheck size={16} /> Admin</button>}
          <button role="menuitem" type="button" className="danger" onClick={() => { setOpen(false); logout(); navigate("/"); }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user } = useAuth();
  const city = useCity();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState(params.get("q") || "");

  useEffect(() => {
    api.get("/cities").then((d) => {
      setCities(d.cities);
      if (d.cities.length && !d.cities.includes(city)) setCity(d.cities[0]);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  const hideTabs = location.pathname.startsWith("/shows/");
  const initial = user?.name?.charAt(0).toUpperCase();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="SeatDrop home">
            <Logo />
            <span>SeatDrop</span>
          </Link>

          <form className="topbar-search" onSubmit={search} role="search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movies, artists, shows" aria-label="Search events" />
          </form>

          <nav className="topbar-links" aria-label="Main">
            <NavLink to="/" end>Explore</NavLink>
            <NavLink to="/bookings">My tickets</NavLink>
            {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <div className="topbar-actions">
            {cities.length > 0 && <CitySelect cities={cities} />}
            <ThemeToggle />
            {user ? (
              <span className="only-desktop">
                <AccountMenu><span className="avatar">{initial}</span></AccountMenu>
              </span>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      {!hideTabs && (
        <nav className="tabbar" aria-label="Main">
          <NavLink to="/" end><Search size={20} /><span>Explore</span></NavLink>
          <NavLink to="/bookings"><Ticket size={20} /><span>Tickets</span></NavLink>
          {user ? (
            <AccountMenu placement="up">
              <User size={20} /><span>Account</span>
            </AccountMenu>
          ) : (
            <NavLink to="/login"><User size={20} /><span>Sign in</span></NavLink>
          )}
        </nav>
      )}
    </>
  );
}
