import { useEffect, useMemo, useRef } from "preact/hooks";
import { renderMarkdown } from "../markdown";

/** 渲染 Markdown，并给每个代码块加「复制」按钮 */
export function Markdown({ source, class: cls = "" }: { source: string; class?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(source), [source]);

  useEffect(() => {
    ref.current?.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "复制";
      btn.onclick = async () => {
        await navigator.clipboard.writeText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = "复制"), 1200);
      };
      pre.appendChild(btn);
    });
  }, [html]);

  return <div ref={ref} class={`md ${cls}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
