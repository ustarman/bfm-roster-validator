/** The Australia Post swoosh: an asymmetric concave sweep, never symmetric. */
export function Swoosh() {
  return (
    <svg className="swoosh" viewBox="0 0 330 56" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,56 L0,14 C95,40 210,52 330,44 L330,56 Z" fill="var(--page-bg)" />
    </svg>
  );
}
