import { IconInbox } from "@/components/icons";
import { Single } from "@/components/panes";
import { ToolLink } from "@/components/tool-button";

export default function NotFound() {
  return (
    <Single>
      <p className="mono text-xs text-ink-3">404 · returned to sender</p>
      <h1 className="mt-1 text-2xl">No such folder</h1>
      <p className="mt-2 max-w-prose text-ink-2">This address is not part of the site. Plans live under /plan/P1, cancellations under /request/R1.</p>
      <ToolLink href="/" variant="ink" icon={<IconInbox />} className="mt-5">
        Back to the inbox
      </ToolLink>
    </Single>
  );
}
