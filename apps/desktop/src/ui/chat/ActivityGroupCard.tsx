import { memo, useEffect, useMemo, useState } from "react";

import {
  AlertTriangleIcon,
  BrainIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ShieldAlertIcon,
} from "lucide-react";

import type { ToolFeedState } from "../../app/types";
import type { ActivityFeedItem, ActivityGroupStatus, ToolTraceItem } from "./activityGroups";

import { MessageResponse } from "../../components/ai-elements/message";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { cn } from "../../lib/utils";

import { summarizeActivityGroup } from "./activityGroups";
import { formatToolCard } from "./toolCards/toolCardFormatting";

function ActivityStatusIcon({ status, className }: { status: ActivityGroupStatus; className?: string }) {
  if (status === "approval") {
    return <ShieldAlertIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  if (status === "issue") {
    return <AlertTriangleIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  if (status === "running") {
    return <ClockIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  return <CheckCircleIcon className={cn("size-3.5 shrink-0", className)} />;
}

function reasoningLabel(mode: "reasoning" | "summary"): string {
  return mode === "summary" ? "Reasoning summary" : "Reasoning";
}

function toolTraceStatusLabel(state: ToolFeedState): string {
  if (state === "approval-requested") return "Review";
  if (state === "output-error") return "Error";
  if (state === "output-denied") return "Denied";
  if (state === "input-streaming" || state === "input-available") return "Running";
  return "Done";
}

function toolTraceBadgeVariant(state: ToolFeedState): "outline" | "secondary" | "destructive" {
  if (state === "output-error" || state === "output-denied") return "destructive";
  if (state === "output-available") return "outline";
  return "secondary";
}

function ToolTraceStatusIcon({ state, className }: { state: ToolFeedState; className?: string }) {
  if (state === "approval-requested") {
    return <ShieldAlertIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  if (state === "output-error" || state === "output-denied") {
    return <AlertTriangleIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  if (state === "input-streaming" || state === "input-available") {
    return <ClockIcon className={cn("size-3.5 shrink-0", className)} />;
  }
  return <CheckCircleIcon className={cn("size-3.5 shrink-0", className)} />;
}

const ToolTraceRow = memo(function ToolTraceRow(props: {
  index: number;
  item: ToolTraceItem;
}) {
  const formatting = useMemo(
    () => formatToolCard(props.item.name, props.item.args, props.item.result, props.item.state),
    [props.item.args, props.item.name, props.item.result, props.item.state],
  );
  const detailRows = useMemo(
    () => formatting.details.filter((row) => row.label !== "Status"),
    [formatting.details],
  );
  const [expanded, setExpanded] = useState(
    props.item.state === "approval-requested" ||
    props.item.state === "output-error" ||
    props.item.state === "output-denied",
  );
  const shouldAutoExpand =
    props.item.state === "approval-requested" ||
    props.item.state === "output-error" ||
    props.item.state === "output-denied";

  useEffect(() => {
    if (shouldAutoExpand) {
      setExpanded(true);
    }
  }, [shouldAutoExpand]);

  const rowBody = (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/25 text-[11px] font-semibold text-muted-foreground">
        {String(props.index + 1).padStart(2, "0")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-foreground">{formatting.title}</div>
        </div>
        <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">
          {formatting.subtitle}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge
          variant={toolTraceBadgeVariant(props.item.state)}
          className="inline-flex min-h-7 items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        >
          <ToolTraceStatusIcon state={props.item.state} />
          <span>{toolTraceStatusLabel(props.item.state)}</span>
        </Badge>
        {detailRows.length > 0 ? (
          <ChevronDownIcon className="size-4 text-muted-foreground/40 transition-transform group-data-[state=open]:rotate-180" />
        ) : null}
      </div>
    </div>
  );

  if (detailRows.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/70 shadow-sm">
        {rowBody}
      </div>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-sm">
        <CollapsibleTrigger className="group w-full text-left outline-none transition-colors hover:bg-muted/10">
          {rowBody}
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/50 px-3 pb-3 pt-3">
          <div className="ml-10 grid gap-2 sm:grid-cols-2">
            {detailRows.map((row) => (
              <div key={`${props.item.id}-${row.label}`} className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {row.label}
                </div>
                <div className="mt-1 break-words text-xs leading-5 text-foreground/85">
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
});

export const ActivityGroupCard = memo(function ActivityGroupCard(props: { items: ActivityFeedItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const summary = useMemo(() => summarizeActivityGroup(props.items), [props.items]);
  const shouldAutoExpand = summary.status === "approval" || summary.status === "issue";

  useEffect(() => {
    if (shouldAutoExpand) {
      setExpanded(true);
    }
  }, [shouldAutoExpand]);

  return (
    <Card className="max-w-3xl border-border/70 bg-card/70 shadow-sm backdrop-blur-sm">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="group w-full text-left outline-none">
          <CardHeader className="gap-3 p-4 transition-colors hover:bg-muted/15">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-sm">
                  <BrainIcon className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{summary.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {summary.reasoningItems.length > 0 ? (
                      <Badge variant="secondary" className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {summary.reasoningItems.length === 1 ? "1 note" : `${summary.reasoningItems.length} notes`}
                      </Badge>
                    ) : null}
                    {summary.toolItems.length > 0 ? (
                      <Badge variant="outline" className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {summary.toolItems.length === 1 ? "1 tool" : `${summary.toolItems.length} tools`}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">{summary.preview}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end lg:self-start">
                <Badge
                  variant={summary.status === "issue" ? "destructive" : summary.status === "done" ? "outline" : "secondary"}
                  className="inline-flex min-h-7 items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                >
                  <ActivityStatusIcon status={summary.status} />
                  <span>{summary.statusLabel}</span>
                </Badge>
                <ChevronDownIcon className="size-4 text-muted-foreground/50 transition-transform group-data-[state=open]:rotate-180" />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4 border-t border-border/60 pb-4 pt-4">
            {summary.reasoningItems.length > 0 ? (
              <div className="flex flex-col gap-3">
                {summary.reasoningItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {reasoningLabel(item.mode)}
                    </div>
                    <MessageResponse className="text-sm leading-6 text-foreground/85">{item.text}</MessageResponse>
                  </div>
                ))}
              </div>
            ) : null}

            {summary.toolItems.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Trace
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {summary.toolItems.length === 1 ? "1 step" : `${summary.toolItems.length} steps`}
                  </div>
                </div>
                <div className={cn("flex flex-col gap-2.5", summary.toolItems.length > 6 && "max-h-96 overflow-y-auto pr-1")}>
                  {summary.toolItems.map((item, index) => (
                    <ToolTraceRow
                      key={item.id}
                      index={index}
                      item={item}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
});
