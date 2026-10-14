/**
 * The studio grain (DESIGN.md §6).
 *
 * A fixed fibre/tooth overlay at ~5% opacity. It is the single cheapest thing that makes a screen
 * read as paper instead of as a web page, and it costs one div and no network request.
 */
export function Grain() {
  return <div aria-hidden="true" className="paper-grain" />
}
