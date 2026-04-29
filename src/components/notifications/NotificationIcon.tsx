import { createElement } from "react";
import { iconFor, colorFor } from "./notificationIcons";

/**
 * Render a notification's icon at the chosen size and color.
 *
 * We call the underlying Lucide component via `createElement` instead of
 * the `<Icon />` JSX form on purpose: the React-19 lint rule
 * `react-hooks/static-components` flags any `const Icon = expr()` followed
 * by `<Icon />` JSX as "component created during render" even when the
 * expression is a deterministic lookup. Using `createElement` keeps the
 * intent explicit and side-steps the rule.
 */
export function NotificationIcon({
  type,
  category,
  size = 18,
  className,
}: {
  type: string;
  category?: string | null;
  size?: number;
  className?: string;
}) {
  return createElement(iconFor(type, category), { size, className });
}

export { colorFor };
