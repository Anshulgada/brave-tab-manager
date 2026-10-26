export function LoadingState() {
  return (
    <div className="content-skeleton" aria-live="polite" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-sub" />
      <div className="skeleton-grid">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((slot) => (
          <div className="skeleton skeleton-card" key={slot} />
        ))}
      </div>
    </div>
  );
}
