import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="page narrow empty">
      <p className="eyebrow mono">404</p>
      <h1>This seat doesn't exist</h1>
      <p className="muted">The page you're looking for has moved or never existed.</p>
      <Link to="/" className="btn btn-primary">Back to events</Link>
    </main>
  );
}
