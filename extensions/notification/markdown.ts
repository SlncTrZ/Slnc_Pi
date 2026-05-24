/**
 * Strip fenced code blocks and markdown formatting from text,
 * producing clean prose suitable for TTS narration.
 */

/** Remove fenced code blocks (``` ... ```) and inline code (`...`). */
export function stripCodeBlocks(text: string): string {
  // Remove fenced code blocks (with optional language tag)
  let result = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  result = result.replace(/`[^`\n]*`/g, '');
  return result;
}

/** Remove common markdown formatting artifacts. */
export function stripMarkdownFormatting(text: string): string {
  let result = text;

  // Remove images: ![alt](url) -> alt
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Remove links: [text](url) -> text
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Remove heading markers: ### Text
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers: **text**, *text*, __text__, _text_
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');
  result = result.replace(/\*(.+?)\*/g, '$1');
  result = result.replace(/_(.+?)_/g, '$1');

  // Remove strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '$1');

  // Remove blockquote markers
  result = result.replace(/^>\s+/gm, '');

  // Remove unordered list markers: - item, * item, + item
  result = result.replace(/^[\s]*[-*+]\s+/gm, '');

  // Remove ordered list markers: 1. item
  result = result.replace(/^[\s]*\d+\.\s+/gm, '');

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, '');

  // Remove HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Collapse multiple newlines into double newline, trim
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

/** Full strip: code blocks first, then formatting. */
export function stripForSpeech(text: string): string {
  return stripMarkdownFormatting(stripCodeBlocks(text));
}
