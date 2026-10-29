import { createElement, type ReactNode, type CSSProperties } from "react";

export type DesignNode =
  | string
  | {
      tag: string;
      attrs: Record<string, string | null>;
      children: DesignNode[];
    };
export type Overrides = Record<
  string,
  | ReactNode
  | ((
      node: Exclude<DesignNode, string>,
      props: Record<string, unknown>,
      children: ReactNode,
    ) => ReactNode)
>;
const names: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  novalidate: "noValidate",
  autocomplete: "autoComplete",
  maxlength: "maxLength",
  minlength: "minLength",
  inputmode: "inputMode",
  viewbox: "viewBox",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  "clip-path": "clipPath",
  "aria-hidden": "aria-hidden",
  crossorigin: "crossOrigin",
  preserveaspectratio: "preserveAspectRatio",
};
const bool = new Set([
  "hidden",
  "inert",
  "disabled",
  "required",
  "readOnly",
  "multiple",
  "checked",
  "autoFocus",
  "noValidate",
]);
function style(value: string): CSSProperties {
  return Object.fromEntries(
    value
      .split(";")
      .filter((s) => s.includes(":"))
      .map((s) => {
        const i = s.indexOf(":");
        const key = s.slice(0, i).trim();
        return [
          key.startsWith("--")
            ? key
            : key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
          s.slice(i + 1).trim(),
        ];
      }),
  );
}
/** Only the checked-in approved design is rendered here. API content stays escaped React text. */
export function Design({
  nodes,
  overrides = {},
}: {
  nodes: DesignNode[];
  overrides?: Overrides;
}) {
  function render(node: DesignNode, key: number): ReactNode {
    if (typeof node === "string") return node;
    const props: Record<string, unknown> = { key };
    for (const [raw, value] of Object.entries(node.attrs)) {
      const name =
        names[raw] ||
        (raw.startsWith("aria-") || raw.startsWith("data-")
          ? raw
          : raw.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));
      if (name.startsWith("on")) continue;
      props[name] =
        name === "style"
          ? style(value || "")
          : bool.has(name)
            ? true
            : value === null
              ? ""
              : value;
    }
    if (node.tag === "input" && "value" in props) {
      props.defaultValue = props.value;
      delete props.value;
    }
    const children = node.children.map(render);
    const replacement = overrides[node.attrs.id || ""];
    if (typeof replacement === "function")
      return replacement(node, props, children);
    return createElement(
      node.tag,
      props,
      ...(replacement !== undefined ? [replacement] : children),
    );
  }
  return nodes.map(render);
}
