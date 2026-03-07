import { memo, useEffect, useMemo, useState } from "react";

import type { ToolApprovalMetadata, ToolFeedState } from "../../../app/types";

import {
  Tool,
  ToolCodeBlock,
  ToolContent,
  ToolHeader,
} from "../../../components/ai-elements/tool";

import { formatToolCard } from "./toolCardFormatting";

type ToolCardProps = {
  approval?: ToolApprovalMetadata;
  args?: unknown;
  name: string;
  result?: unknown;
  state: ToolFeedState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const ToolCard = memo(function ToolCard(props: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldAutoExpand =
    props.state === "approval-requested" ||
    props.state === "output-available" ||
    props.state === "output-error" ||
    props.state === "output-denied";

  const displayName = useMemo(() => {
    if (props.name === "tool" && isRecord(props.args) && typeof props.args.name === "string") {
      return props.args.name;
    }
    return props.name;
  }, [props.args, props.name]);

  useEffect(() => {
    if (shouldAutoExpand) {
      setExpanded(true);
    }
  }, [shouldAutoExpand]);

  const approvalJson = useMemo(() => toJson(props.approval), [props.approval]);
  const argsJson = useMemo(() => toJson(props.args), [props.args]);
  const resultJson = useMemo(() => toJson(props.result), [props.result]);
  const formatting = useMemo(
    () => formatToolCard(displayName, props.args, props.result, props.state),
    [displayName, props.args, props.result, props.state],
  );

  return (
    <Tool open={expanded} onOpenChange={setExpanded}>
      <ToolHeader title={formatting.title} subtitle={formatting.subtitle} state={props.state} />
      <ToolContent>
        {approvalJson ? (
          <ToolCodeBlock
            label="Approval"
            value={approvalJson}
            tone={props.state === "output-denied" ? "error" : "default"}
          />
        ) : null}
        {argsJson ? <ToolCodeBlock label="Input" value={argsJson} /> : null}
        {resultJson ? (
          <ToolCodeBlock
            label={props.state === "output-error" || props.state === "output-denied" ? "Issue" : "Output"}
            value={resultJson}
            tone={props.state === "output-error" || props.state === "output-denied" ? "error" : "default"}
          />
        ) : null}
      </ToolContent>
    </Tool>
  );
});
