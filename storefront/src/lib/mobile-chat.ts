export type MobileAssistantReplyBlock =
  | { type: "paragraph"; text: string }
  | { type: "directions"; items: string[] }

const numberedInstruction = /^(?:(?:step\s*)?\d{1,2}[.)]|[-•])\s+(.+)$/i
const directionSignal = /\b(?:go to|head to|navigate to|visit|tap|choose|select|click|open (?:the |your |my )?(?:account|profile|orders?|bag|cart|wishlist|support|payment|delivery|product|settings|app|page))\b/i
const directionContinuation = /^(?:first|next|then|after that|from there|once there|finally),?\s+/i

function cleanInstruction(value: string) {
  return value.trim().replace(/^[-•]\s*/, "").replace(/\s+/g, " ")
}

function splitSentences(value: string) {
  return value.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
}

function paragraphBlocks(value: string): MobileAssistantReplyBlock[] {
  const sentences = splitSentences(value)
  const firstDirection = sentences.findIndex((sentence) =>
    directionSignal.test(sentence) || directionContinuation.test(sentence),
  )
  if (firstDirection < 0) return value ? [{ type: "paragraph", text: value }] : []

  const before = sentences.slice(0, firstDirection).join(" ").trim()
  const directions: string[] = []
  let afterIndex = firstDirection
  for (; afterIndex < sentences.length; afterIndex += 1) {
    const sentence = sentences[afterIndex]
    if (
      afterIndex > firstDirection &&
      !directionSignal.test(sentence) &&
      !directionContinuation.test(sentence)
    ) break
    directions.push(cleanInstruction(sentence.replace(directionContinuation, "")))
  }
  const after = sentences.slice(afterIndex).join(" ").trim()

  return [
    ...(before ? [{ type: "paragraph" as const, text: before }] : []),
    ...(directions.length ? [{ type: "directions" as const, items: directions }] : []),
    ...(after ? [{ type: "paragraph" as const, text: after }] : []),
  ]
}

export function formatMobileAssistantReply(content: string): MobileAssistantReplyBlock[] {
  const normalized = content
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+(?=(?:(?:step\s*)?\d{1,2}[.)]|[-•])\s+)/gi, "\n")
    .trim()
  if (!normalized) return []

  const blocks: MobileAssistantReplyBlock[] = []
  let pendingDirections: string[] = []
  const flushDirections = () => {
    if (!pendingDirections.length) return
    blocks.push({ type: "directions", items: pendingDirections })
    pendingDirections = []
  }

  normalized.split(/\n+/).forEach((line) => {
    const cleanLine = line.trim()
    if (!cleanLine) return
    const instruction = cleanLine.match(numberedInstruction)
    if (instruction) {
      pendingDirections.push(cleanInstruction(instruction[1]))
      return
    }
    flushDirections()
    blocks.push(...paragraphBlocks(cleanLine))
  })
  flushDirections()

  return blocks
}

export function mobileAssistantResponseKind(
  content: string,
): "general" | "directions" | "order" | "product" {
  if (formatMobileAssistantReply(content).some((block) => block.type === "directions")) return "directions"
  if (/\b(order|track|delivery|payment|refund|return|cancel)\b/i.test(content)) return "order"
  if (/\b(product|piece|sofa|chair|table|bed|cabinet|stock|price)\b/i.test(content)) return "product"
  return "general"
}
