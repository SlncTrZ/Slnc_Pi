/**
 * Strip fenced code blocks and common markdown formatting from text so
 * that TTS reads only clean narrative prose.
 */

/** Remove fenced code blocks (``` ... ```) including the fence markers */
function stripCodeBlocks(text: string): string {
  // Handle fenced blocks with optional language tag
  return text.replace(/```[\s\S]*?```/g, "");
}

/** Strip inline code spans (`...`) — keep the content, drop the backticks */
function stripInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1");
}

/** Strip markdown links [text](url) — keep only the link text */
function stripLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/** Strip image references ![alt](url) */
function stripImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
}

/** Strip heading markers (#, ##, etc.) at the start of lines */
function stripHeadings(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "");
}

/** Strip bold/italic markers (**, *, __, _) */
function stripEmphasis(text: string): string {
  // Bold+italic first (*** or ___)
  let result = text.replace(/\*{3}([^*]+)\*{3}/g, "$1");
  result = result.replace(/_{3}([^_]+)_{3}/g, "$1");
  // Bold (** or __)
  result = result.replace(/\*{2}([^*]+)\*{2}/g, "$1");
  result = result.replace(/_{2}([^_]+)_{2}/g, "$1");
  // Italic (* or _) — careful not to strip lone * or _ that aren't emphasis
  result = result.replace(/\*([^*]+)\*/g, "$1");
  result = result.replace(/_([^_]+)_/g, "$1");
  return result;
}

/** Strip blockquote markers (> ) at the start of lines */
function stripBlockquotes(text: string): string {
  return text.replace(/^>\s?/gm, "");
}

/** Strip unordered list markers (-, *, +) at the start of lines */
function stripLists(text: string): string {
  return text.replace(/^[\s]*[-*+]\s+/gm, "");
}

/** Strip ordered list markers (1., 2., etc.) at the start of lines */
function stripNumberedLists(text: string): string {
  return text.replace(/^[\s]*\d+\.\s+/gm, "");
}

/** Strip horizontal rules */
function stripHorizontalRules(text: string): string {
  return text.replace(/^[-*_]{3,}\s*$/gm, "");
}

/**
 * Apply all markdown-stripping transforms in a reasonable order.
 */
export function stripMarkdown(text: string): string {
  let result = text;
  result = stripCodeBlocks(result);
  result = stripInlineCode(result);
  result = stripImages(result);
  result = stripLinks(result);
  result = stripHeadings(result);
  result = stripEmphasis(result);
  result = stripBlockquotes(result);
  result = stripLists(result);
  result = stripNumberedLists(result);
  result = stripHorizontalRules(result);
  // Collapse multiple blank lines into a single newline
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

/**
 * Split text into sentence chunks. Uses a basic regex that splits on
 * period/exclamation/question followed by a space and uppercase letter
 * (or end of string). Falls back to splitting on newlines for text
 * without standard sentence terminators.
 */
export function splitIntoSentences(text: string): string[] {
  // Remove excessive whitespace
  let cleaned = text.replace(/\s+/g, " ").trim();

  if (!cleaned) return [];

  // Split on sentence-ending punctuation followed by space + uppercase or end
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/gu);

  if (sentences && sentences.length > 0) {
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  // Fallback: split on newlines (original text, not cleaned)
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) return lines;

  // Last resort: return the whole text as a single chunk
  return [cleaned];
}
