/**
 * ChatPanel — Floating chat widget for student feedback questions
 *
 * Renders a toggleable chat interface where students can ask questions about
 * their feedback. Uses forwardRef and useImperativeHandle to expose a
 * sendMessage method so parent components can trigger messages externally.
 */
import { useState, useRef, useEffect, useImperativeHandle, useCallback, forwardRef } from 'react';
import { Bot, X, Send, Loader2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatPanelHandle {
  sendMessage: (msg: string) => void;
}

interface ChatPanelProps {
  onChat: (message: string, history: { role: string; content: string }[]) => Promise<string>;
}

const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(({ onChat }, ref) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const sendChatMessage = useCallback(async (messageOverride?: string) => {
    const messageToSend = messageOverride || chatInput.trim();
    if (!messageToSend || chatLoading) return;

    if (!messageOverride) setChatInput('');
    setChatError(null);

    const newMessages = [...chatMessages, { role: 'user', content: messageToSend }];
    setChatMessages(newMessages);
    setChatLoading(true);

    // Open chat if it's not already open
    if (!chatOpen) setChatOpen(true);

    try {
      const response = await onChat(messageToSend, chatMessages);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatOpen, onChat]);

  useImperativeHandle(ref, () => ({
    sendMessage: (msg: string) => sendChatMessage(msg),
  }), [sendChatMessage]);

  return (
    <>
      {/* Floating Chat Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-forest-600 hover:bg-forest-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-transform hover:scale-105"
          title="Ask about your feedback"
        >
          <Bot className="w-6 h-6" />
        </button>
      )}

      {/* Chat Panel */}
      {chatOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[32rem] max-h-[80vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-50">
          {/* Header */}
          <div className="bg-sidebar text-white px-4 py-3 rounded-t-xl flex items-center gap-3">
            <Bot className="w-5 h-5" />
            <span className="font-medium flex-1">Ask About Your Feedback</span>
            <button
              onClick={() => setChatOpen(false)}
              className="p-1 hover:bg-white/10 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="text-center text-gray-500 text-sm py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>Ask me anything about your feedback!</p>
                <p className="text-xs mt-1">I can help explain comments, suggest improvements, or clarify rubric criteria.</p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-forest-100 text-gray-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <Bot className="w-4 h-4 text-forest-500 mb-1" />
                  )}
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        code: ({ children }) => <code className="bg-gray-200 rounded px-1 text-xs font-mono">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Error banner */}
          {chatError && (
            <div className="mx-4 mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1">{chatError}</span>
              <button onClick={() => setChatError(null)} className="text-red-500 hover:text-red-700">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder="Ask about your feedback..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-forest-500"
                disabled={chatLoading}
              />
              <button
                onClick={() => sendChatMessage()}
                disabled={!chatInput.trim() || chatLoading}
                className="p-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;
