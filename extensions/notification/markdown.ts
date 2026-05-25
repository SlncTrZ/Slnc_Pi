/**
 * Strip fenced code blocks and common markdown formatting from text
 * so that TTS reads only clean narrative prose.
 */

/** Remove fenced code blocks (``` ... ```) */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/** Remove inline code (`...`) */
function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

/** Remove markdown images ![alt](url) */
function stripImages(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
}

/** Remove markdown links [text](url), keeping the link text */
function stripLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/** Remove heading markers (#, ##, etc.) */
function stripHeadings(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "");
}

/** Remove bold/italic markers (**, *, __, _) */
function stripEmphasis(text: string): string {
  let result = text;
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/\*(.+?)\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");
  result = result.replace(/_(.+?)_/g, "$1");
  return result;
}

/** Remove blockquote markers (> ) */
function stripBlockquotes(text: string): string {
  return text.replace(/^>\s?/gm, "");
}

/** Remove horizontal rules */
function stripHorizontalRules(text: string): string {
  return text.replace(/^[-*_]{3,}\s*$/gm, "");
}

/** Remove list markers (-, *, 1., etc.) at start of lines */
function stripListMarkers(text: string): string {
  let result = text;
  result = result.replace(/^[\s]*[-*+]\s+/gm, "");
  result = result.replace(/^[\s]*\d+\.\s+/gm, "");
  return result;
}

/** Collapse multiple newlines into double newline, trim */
function collapseWhitespace(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Process raw markdown text into clean prose suitable for TTS.
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
  result = stripHorizontalRules(result);
  result = stripListMarkers(result);
  result = collapseWhitespace(result);
  return result;
}

/**
 * Split text into sentence chunks for progressive TTS.
 * Uses a simple regex for sentence boundaries (.!?) followed by space or end-of-string.
 */
export function splitSentences(text: string): string[] {
  // Match sentences ending in . ! ? possibly followed by closing quotes/parens
  const sentences = text.match(/[^.!?]*[.!?]["'")\]]*|[^.!?]+/g);
  if (!sentences) return [text];
  return sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
