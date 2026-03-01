/**
 * FeedbackPDF — PDF export document for student feedback
 *
 * Generates a structured PDF with three sections: Overall Feedback,
 * By Criteria, and Essay with Inline Comments (numbered annotations).
 * Used via PDFDownloadLink in StudentFeedback.tsx.
 */
import {
  Document, Page, Text, View, StyleSheet
} from '@react-pdf/renderer';

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    lineHeight: 1.5,
  },

  // Header
  header: {
    marginBottom: 24,
    paddingBottom: 14,
    borderBottom: '1.5pt solid #2c6e3e',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#2c6e3e',
    marginBottom: 6,
  },
  headerMeta: {
    fontSize: 9,
    color: '#555',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerMetaItem: {
    flexDirection: 'row',
    gap: 3,
  },
  headerMetaLabel: {
    color: '#888',
  },
  headerMetaValue: {
    fontFamily: 'Helvetica-Bold',
    color: '#333',
  },

  // Section headings
  sectionHeading: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1a2b1e',
    marginTop: 22,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottom: '0.5pt solid #b9ddbf',
  },
  criterionHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#245834',
    marginTop: 14,
    marginBottom: 6,
  },
  subHeading: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 3,
  },

  // Blocks
  card: {
    backgroundColor: '#f0f7f1',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.6,
  },

  // Lists
  listItem: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  bullet: {
    width: 14,
    color: '#3a8a4e',
    fontFamily: 'Helvetica-Bold',
  },
  listText: {
    flex: 1,
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },

  // Inline comment annotations
  essayText: {
    fontSize: 9.5,
    color: '#222',
    lineHeight: 1.7,
    fontFamily: 'Helvetica',
    backgroundColor: '#fafaf6',
    padding: 10,
    borderRadius: 4,
    marginBottom: 14,
  },
  annotationBlock: {
    marginBottom: 8,
    paddingLeft: 10,
    borderLeft: '2pt solid #5aa668',
  },
  annotationNumber: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#245834',
    marginBottom: 3,
  },
  annotationComment: {
    fontSize: 9.5,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#aaa',
    borderTop: '0.5pt solid #ddd',
    paddingTop: 6,
  },
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface InlineComment {
  id: string;
  highlightedText: string;
  comment: string;
  startPosition: number;
  criterion?: { name: string };
}

interface SectionFeedback {
  id: string;
  criterion: { name: string };
  strengths: string | string[];
  areasForGrowth: string;
  suggestions: string;
}

interface OverallFeedback {
  summary: string;
  priorityImprovements: string | string[];
  encouragement?: string;
  nextSteps: string | string[];
}

interface FeedbackPDFProps {
  studentName?: string;
  assignmentName?: string;
  fileName?: string;
  overallFeedback?: OverallFeedback;
  sectionFeedback?: SectionFeedback[];
  inlineComments?: InlineComment[];
  extractedText?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return [value].filter(Boolean);
}

// Split essay into segments: plain text interleaved with superscript markers
interface TextSegment {
  text: string;
  superscript?: number; // if set, render as superscripted marker
}

function buildTextSegments(text: string, comments: InlineComment[]): TextSegment[] {
  if (!text || comments.length === 0) return [{ text }];

  const sorted = [...comments].sort((a, b) => a.startPosition - b.startPosition);
  const segments: TextSegment[] = [];
  let cursor = 0;

  sorted.forEach((comment, i) => {
    const start = comment.startPosition;
    const end = start + comment.highlightedText.length;
    if (start < cursor || start > text.length) return;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: String(i + 1), superscript: i + 1 });
    cursor = end;
  });

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

// ─── PDF Document ────────────────────────────────────────────────────────────

export default function FeedbackPDF({
  studentName,
  assignmentName,
  fileName,
  overallFeedback,
  sectionFeedback,
  inlineComments,
  extractedText,
}: FeedbackPDFProps) {
  const sortedComments = inlineComments
    ? [...inlineComments].sort((a, b) => a.startPosition - b.startPosition)
    : [];

  const improvements = parseList(overallFeedback?.priorityImprovements);
  const nextSteps = parseList(overallFeedback?.nextSteps);
  const generatedDate = new Date().toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <Document
      title={`Feedback — ${studentName || 'Student'}`}
      author="FeedbackLab"
    >
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feedback Report</Text>
          <View style={styles.headerMeta}>
            {studentName && (
              <View style={styles.headerMetaItem}>
                <Text style={styles.headerMetaLabel}>Student: </Text>
                <Text style={styles.headerMetaValue}>{studentName}</Text>
              </View>
            )}
            {assignmentName && (
              <View style={styles.headerMetaItem}>
                <Text style={styles.headerMetaLabel}>Assignment: </Text>
                <Text style={styles.headerMetaValue}>{assignmentName}</Text>
              </View>
            )}
            {fileName && (
              <View style={styles.headerMetaItem}>
                <Text style={styles.headerMetaLabel}>File: </Text>
                <Text style={styles.headerMetaValue}>{fileName}</Text>
              </View>
            )}
            <View style={styles.headerMetaItem}>
              <Text style={styles.headerMetaLabel}>Generated: </Text>
              <Text style={styles.headerMetaValue}>{generatedDate}</Text>
            </View>
          </View>
        </View>

        {/* ── Section 1: Overall Feedback ── */}
        {overallFeedback && (
          <View>
            <Text style={styles.sectionHeading}>Overall Feedback</Text>

            {overallFeedback.summary && (
              <View style={styles.card}>
                <Text style={styles.summaryText}>{overallFeedback.summary}</Text>
              </View>
            )}

            {overallFeedback.encouragement && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.subHeading}>Encouragement</Text>
                <Text style={styles.summaryText}>{overallFeedback.encouragement}</Text>
              </View>
            )}

            {improvements.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.subHeading}>Priority Improvements</Text>
                {improvements.map((item, i) => (
                  <View key={i} style={styles.listItem}>
                    <Text style={styles.bullet}>{i + 1}.</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {nextSteps.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.subHeading}>Next Steps</Text>
                {nextSteps.map((item, i) => (
                  <View key={i} style={styles.listItem}>
                    <Text style={styles.bullet}>{i + 1}.</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Section 2: By Criteria ── */}
        {sectionFeedback && sectionFeedback.length > 0 && (
          <View>
            <Text style={styles.sectionHeading}>Feedback by Criteria</Text>
            {sectionFeedback.map((section) => {
              const strengths = parseList(section.strengths);
              const growth = parseList(section.areasForGrowth);
              const suggestions = parseList(section.suggestions);
              return (
                <View key={section.id}>
                  <Text style={styles.criterionHeading}>{section.criterion.name}</Text>

                  {strengths.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={styles.subHeading}>Strengths</Text>
                      {strengths.map((s, i) => (
                        <View key={i} style={styles.listItem}>
                          <Text style={styles.bullet}>•</Text>
                          <Text style={styles.listText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {growth.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={styles.subHeading}>Areas for Growth</Text>
                      {growth.map((g, i) => (
                        <View key={i} style={styles.listItem}>
                          <Text style={styles.bullet}>•</Text>
                          <Text style={styles.listText}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {suggestions.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.subHeading}>Suggestions</Text>
                      {suggestions.map((s, i) => (
                        <View key={i} style={styles.listItem}>
                          <Text style={styles.bullet}>{i + 1}.</Text>
                          <Text style={styles.listText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Section 3: Essay with Inline Comments ── */}
        {extractedText && sortedComments.length > 0 && (
          <View>
            <Text style={styles.sectionHeading}>Essay with Inline Comments</Text>

            {/* Essay text with superscript markers inline */}
            <Text style={styles.essayText}>
              {buildTextSegments(extractedText, sortedComments).map((seg, i) =>
                seg.superscript !== undefined ? (
                  <Text
                    key={i}
                    style={{
                      fontSize: 6,
                      verticalAlign: 'super',
                      color: '#2c6e3e',
                      fontFamily: 'Helvetica-Bold',
                    }}
                  >
                    {seg.text}
                  </Text>
                ) : (
                  <Text key={i}>{seg.text}</Text>
                )
              )}
            </Text>

            {/* Numbered comments below the essay */}
            {sortedComments.map((comment, i) => (
              <View key={comment.id} style={styles.annotationBlock} wrap={false}>
                <Text style={styles.annotationNumber}>
                  <Text style={{ fontSize: 7, verticalAlign: 'super' }}>{i + 1}</Text>
                  {comment.criterion ? `  ${comment.criterion.name}` : ''}
                </Text>
                <Text style={styles.annotationComment}>{comment.comment}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text>FeedbackLab</Text>
          <Text render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  );
}
