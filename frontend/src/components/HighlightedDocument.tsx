/**
 * HighlightedDocument — Renders document text with highlighted inline comments
 *
 * Takes a document string and an array of InlineComment objects, then renders
 * the text with yellow highlighted spans at the comment positions. Each
 * highlight shows a hover tooltip with the comment content.
 */
import React, { useMemo } from 'react';
import type { InlineComment } from '../services/api';

interface HighlightedDocumentProps {
  text: string;
  comments: InlineComment[];
}

export default function HighlightedDocument({ text, comments }: HighlightedDocumentProps) {
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.startPosition - b.startPosition),
    [comments]
  );

  if (sortedComments.length === 0) {
    return <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{text}</pre>;
  }

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  sortedComments.forEach((comment, idx) => {
    if (comment.startPosition > lastEnd) {
      segments.push(
        <span key={`text-${idx}`}>
          {text.slice(lastEnd, comment.startPosition)}
        </span>
      );
    }

    segments.push(
      <span
        key={`highlight-${idx}`}
        className="bg-yellow-200 hover:bg-yellow-300 cursor-pointer relative group"
        title={comment.comment}
      >
        {text.slice(comment.startPosition, comment.endPosition)}
        <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-900 text-white text-xs p-2 rounded shadow-lg max-w-xs z-10">
          {comment.criterion && (
            <span className="text-yellow-300 font-medium block mb-1">
              {comment.criterion.name}
            </span>
          )}
          {comment.comment}
        </span>
      </span>
    );

    lastEnd = comment.endPosition;
  });

  if (lastEnd < text.length) {
    segments.push(<span key="text-end">{text.slice(lastEnd)}</span>);
  }

  return <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{segments}</pre>;
}
