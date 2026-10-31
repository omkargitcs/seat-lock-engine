import { Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "./components/Navbar";
import RequireAuth from "./components/RequireAuth";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import BookingDetail from "./pages/BookingDetail";
import Bookings from "./pages/Bookings";
import EventDetail from "./pages/EventDetail";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ShowPage from "./pages/ShowPage";
import { useTheme } from "./utils/theme";

function Shell() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <div id="main">
        <Outlet />
      </div>
      <footer className="footer">
        <span>SeatDrop</span>
        <span className="muted">
          Demo project. Payments are simulated; no real tickets are issued.
        </span>
      </footer>
    </>
  );
}

export default function App() {
  const { theme } = useTheme();
  return (
    <>
      <Toaster
        theme={theme}
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--surface)",
            border: "1px solid var(--line)",
            color: "var(--fg)",
            borderRadius: "10px",
            fontFamily: "var(--font-sans)",
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="shows/:id" element={<ShowPage />} />
          <Route element={<RequireAuth />}>
            <Route path="bookings" element={<Bookings />} />
            <Route path="bookings/:id" element={<BookingDetail />} />
          </Route>
          <Route element={<RequireAuth admin />}>
            <Route path="admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
