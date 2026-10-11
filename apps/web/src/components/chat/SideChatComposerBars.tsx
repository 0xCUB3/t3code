import { CornerDownRightIcon, MessageCircleQuestionIcon, XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";

/**
 * Floats above a side chat's composer while it borrows the main thread's slot.
 * Out of flow, so switching chats never changes the composer's height.
 */
export function SideComposerLabel(props: { onBack: () => void }) {
  return (
    <div className="absolute bottom-full left-0 pb-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pr-0.5 pl-2 text-xs text-muted-foreground">
        <MessageCircleQuestionIcon aria-hidden className="size-3.5 text-primary" />
        <span className="font-medium text-foreground">Side chat</span>
        <span>
          <Kbd>Esc</Kbd> back to main
        </span>
        <Button size="icon-xs" variant="ghost" aria-label="Back to main" onClick={props.onBack}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** In the side panel while the main thread has the composer. */
export function SideChatReplyBar(props: { needsAnswer: boolean; onReply: () => void }) {
  return (
    <div className="pointer-events-auto px-3 pb-3">
      <Button
        className="w-full"
        size="sm"
        variant={props.needsAnswer ? "default" : "outline"}
        onClick={props.onReply}
      >
        <CornerDownRightIcon className="size-3.5" />
        {props.needsAnswer ? "Side chat is waiting on you" : "Reply in side chat"}
      </Button>
    </div>
  );
}

/** Above a side chat's composer, opposite its label, when the main thread needs an answer. */
export function MainThreadWaitingBar() {
  return (
    <div className="absolute right-0 bottom-full pb-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-warning">
        Main thread is waiting on you. <Kbd>Esc</Kbd> to answer it.
      </div>
    </div>
  );
}
