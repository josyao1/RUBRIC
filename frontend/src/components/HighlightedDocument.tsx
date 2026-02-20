/**
 * HighlightedDocument — Renders document text with highlighted inline comments
 *
 * Takes a document string and an array of InlineComment objects, then renders
 * the text with yellow highlighted spans at the comment positions.
 * - Clips overlapping highlights to their non-overlapping tail (no duplicate text)
 * - Collapses newlines within highlights to spaces (PDF extraction artifact)
 * - Supports activeCommentId for click-based cross-emphasis with the sidebar
 */
import React, { useMemo } from 'react';
import type { InlineComment } from '../services/api';

interface HighlightedDocumentProps {
  text: string;
  comments: InlineComment[];
  activeCommentId?: string | null;
  onCommentClick?: (id: string) => void;
}


// pdf-parse emits \n at every visual line-wrap position on the page, using the
// same single \n for both mid-sentence wraps and real paragraph breaks.
// Heuristic: if the character after \n is lowercase it's a line-wrap artifact
// (collapse to space); if it's uppercase it's a sentence/paragraph boundary
// (keep the newline). Existing double-newlines are always preserved.
function normalizePdfText(raw: string): string {
  return raw
    .replace(/\n\n+/g, '\x00')    // protect existing double-newlines
    .replace(/\n([a-z])/g, ' $1') // lowercase next = line-wrap artifact → space
    .replace(/\x00/g, '\n\n');     // restore double-newlines — uppercase-start lines keep their \n
}

export default function HighlightedDocument({
  text,
  comments,
  activeCommentId,
  onCommentClick,
}: HighlightedDocumentProps) {
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.startPosition - b.startPosition),
    [comments]
  );

  if (sortedComments.length === 0) {
    return <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{normalizePdfText(text)}</pre>;
  }

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  sortedComments.forEach((comment, idx) => {
    // If this comment is entirely consumed by the previous highlight, skip it
    if (comment.endPosition <= lastEnd) return;

    // Clip the start to avoid re-rendering already-highlighted text.
    // Overlapping comments each get a highlight span covering their
    // non-overlapping tail — both comments remain clickable, no text duplicates.
    const clipStart = Math.max(comment.startPosition, lastEnd);

    if (clipStart > lastEnd) {
      segments.push(
        <span key={`text-${idx}`}>
          {normalizePdfText(text.slice(lastEnd, clipStart))}
        </span>
      );
    }

    const isActive = comment.id === activeCommentId;

    // Collapse internal newlines to spaces so the highlight renders as a
    // continuous phrase rather than breaking across lines (PDF extraction
    // inserts newlines at original page line-wrap positions)
    const displayText = text
      .slice(clipStart, comment.endPosition)
      .replace(/\n/g, ' ');

    segments.push(
      <span
        key={`highlight-${idx}`}
        data-highlight-id={comment.id}
        onClick={() => onCommentClick?.(comment.id)}
        className={`cursor-pointer rounded-sm transition-colors ${
          isActive
            ? 'bg-yellow-400 outline outline-2 outline-yellow-500'
            : 'bg-yellow-200 hover:bg-yellow-300'
        }`}
      >
        {displayText}
      </span>
    );

    lastEnd = comment.endPosition;
  });

  if (lastEnd < text.length) {
    segments.push(<span key="text-end">{normalizePdfText(text.slice(lastEnd))}</span>);
  }

  return (
    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
      {segments}
    </pre>
  );
}
