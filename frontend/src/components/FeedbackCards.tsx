/**
 * FeedbackCards — Renders AI-generated rubric feedback as styled markdown cards
 *
 * Parses a feedback string into sections (split by markdown headings) and
 * renders each section as a styled card with markdown support via ReactMarkdown.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Feedback Cards Component - renders feedback in card-style sections
export default function FeedbackCards({ feedback }: { feedback: string }) {
  // Split feedback into sections by ## headers, only keep sections that start with ##
  const allParts = feedback.split(/(?=^## )/gm).filter(s => s.trim());
  const sections = allParts.filter(s => s.startsWith('## '));

  // Get intro text (content before first ## header)
  const firstSection = allParts[0];
  const introText = firstSection && !firstSection.startsWith('## ') ? firstSection.trim() : '';

  // Section icons based on title keywords
  const getSectionStyle = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('overall') || lower.includes('assessment') || lower.includes('summary')) {
      return { bg: 'bg-forest-50', border: 'border-forest-200', accent: 'bg-forest-500', text: 'text-forest-900' };
    }
    if (lower.includes('transparency') || lower.includes('clarity')) {
      return { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'bg-blue-500', text: 'text-blue-900' };
    }
    if (lower.includes('quality') || lower.includes('progression') || lower.includes('level')) {
      return { bg: 'bg-purple-50', border: 'border-purple-200', accent: 'bg-purple-500', text: 'text-purple-900' };
    }
    if (lower.includes('learning') || lower.includes('scoring') || lower.includes('focus')) {
      return { bg: 'bg-green-50', border: 'border-green-200', accent: 'bg-green-500', text: 'text-green-900' };
    }
    if (lower.includes('equity') || lower.includes('accessibility') || lower.includes('bias')) {
      return { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'bg-amber-500', text: 'text-amber-900' };
    }
    if (lower.includes('co-creation') || lower.includes('student') || lower.includes('involve')) {
      return { bg: 'bg-teal-50', border: 'border-teal-200', accent: 'bg-teal-500', text: 'text-teal-900' };
    }
    if (lower.includes('recommendation') || lower.includes('suggestion') || lower.includes('action')) {
      return { bg: 'bg-rose-50', border: 'border-rose-200', accent: 'bg-rose-500', text: 'text-rose-900' };
    }
    return { bg: 'bg-gray-50', border: 'border-gray-200', accent: 'bg-gray-500', text: 'text-gray-900' };
  };

  const markdownComponents = {
    p: ({ children }: any) => (
      <p className="text-gray-700 leading-relaxed mb-3">{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside ml-5 mb-4 space-y-2">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside ml-5 mb-4 space-y-2">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-gray-700 leading-relaxed">{children}</li>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-gray-600">{children}</em>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-amber-400 bg-amber-50 px-4 py-2 my-3 italic text-gray-700 rounded-r">
        {children}
      </blockquote>
    ),
    code: ({ children }: any) => (
      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">{children}</code>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-gray-300 text-sm rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-100">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="border border-gray-300 px-3 py-2 text-gray-700">{children}</td>
    ),
    h3: ({ children }: any) => (
      <h3 className="font-semibold text-gray-800 mt-4 mb-2">{children}</h3>
    ),
  };

  return (
    <div className="space-y-4">
      {/* Overview card for intro text */}
      {introText && (
        <div className="bg-gradient-to-r from-forest-600 to-forest-800 rounded-lg overflow-hidden shadow-sm">
          <div className="px-5 py-3">
            <h2 className="text-white font-bold text-lg">Overview</h2>
          </div>
          <div className="p-5 bg-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {introText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Section cards */}
      {sections.map((section, idx) => {
        // Extract title from ## header
        const titleMatch = section.match(/^## (.+?)[\r\n]/);
        const title = titleMatch ? titleMatch[1].trim() : 'Section';
        const content = section.replace(/^## .+?[\r\n]/, '').trim();
        const style = getSectionStyle(title);

        return (
          <div
            key={idx}
            className={`${style.bg} border ${style.border} rounded-lg overflow-hidden shadow-sm`}
          >
            {/* Card header */}
            <div className={`${style.accent} px-5 py-3`}>
              <h2 className="text-white font-bold text-lg">{title}</h2>
            </div>
            {/* Card content */}
            <div className="p-5 bg-white bg-opacity-60">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
