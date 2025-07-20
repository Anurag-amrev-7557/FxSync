import React from 'react';
import PropTypes from 'prop-types';
import { VariableSizeList as List } from 'react-window';

const MessageList = React.memo(function MessageList({
  messages,
  clientId,
  displayName,
  clients,
  mobile,
  messageAnimations,
  handleContextMenu,
  ListComponent,
  scrollContainerRef,
  chatListRef,
  messagesEndRef,
  isGroupStart,
  isGroupEnd,
  selectedTheme,
  bubbleColor,
  bubbleRadius,
  fontFamily,
  getAvatar,
  highlightMentions,
}) {
  // Always use virtualization
  const itemSize = () => 64;
  if (Array.isArray(messages) && messages.length > 0) {
    return (
      <ListComponent
        ref={chatListRef}
        height={400}
        itemCount={Array.isArray(messages) ? messages.length : 0}
        itemSize={itemSize}
        width={'100%'}
        className="flex-1 overflow-y-auto p-4 space-y-2 pb-36 scrollable-container"
        tabIndex={0}
        aria-label="Chat messages list"
      >
        {({ index, style }) => {
          if (!Array.isArray(messages) || !messages[index]) return null;
          const msg = messages[index];
          const isOwn = msg.sender === clientId;
          const groupStart = isGroupStart(messages, index);
          const groupEnd = isGroupEnd(messages, index);
          return (
            <div
              style={style}
              key={msg.messageId || `${msg.sender}-${msg.timestamp}-${index}`}
              className={`flex items-end transition-all duration-300 group ${isOwn ? 'justify-end' : 'justify-start'} enhanced-bubble-appear ${mobile ? '' : messageAnimations[index]?.animationClass || ''} ${groupStart ? 'mt-3' : ''} ${groupEnd ? 'mb-2' : ''} ${mobile ? 'no-select-mobile' : ''}`}
              onContextMenu={e => handleContextMenu(e, msg)}
            >
              {!isOwn && groupStart && (
                <div className="mr-2 flex-shrink-0">
                  <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center border border-neutral-700">
                    {getAvatar(msg.sender)}
                  </div>
                </div>
              )}
              <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                {msg.reaction ? (
                  <div className={`flex items-center gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className="bg-neutral-800 rounded-lg px-3 py-2 text-lg">
                      {msg.reaction}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`inline-block max-w-[80vw] md:max-w-md rounded-xl p-1 px-2 pt-0 shadow-sm transition-all duration-200 group-hover:scale-[1.02] relative`}
                    style={{
                      background: bubbleColor,
                      color: selectedTheme.bubbleText || '#fff',
                      borderRadius: bubbleRadius,
                      fontFamily,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1"></div>
                    <div className="flex flex-row items-end w-full">
                      {msg.deleted || !msg.message ? (
                        <span className="flex-1 text-sm italic text-neutral-500 bg-neutral-800/80 rounded-lg px-3 py-2 select-none cursor-default">
                          <svg className="inline-block mr-1 mb-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          This message was deleted
                        </span>
                      ) : (
                        <span className={`flex-1 text-base break-words ${msg.message && msg.message.includes('@' + displayName) ? 'bg-yellow-400/20' : ''}`} style={{ color: selectedTheme.bubbleText || '#fff' }}>
                          {highlightMentions(msg.message, clients, displayName)}
                          {msg.edited && <span className="text-xs text-neutral-400 ml-1">(edited)</span>}
                        </span>
                      )}
                      <span className="flex items-end gap-1 text-[11px] opacity-70 ml-4 relative top-[4px]">
                        <span>
                          {msg.timestamp
                            ? new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })
                            : 'now'}
                        </span>
                        {/* Delivery status for own messages */}
                        {msg.sender === clientId && (
                          msg.read ? (
                            <span title="Read" className=""><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom"><path d="M4.5 10.5L7.5 13.5L12.5 8.5" stroke="#53BDEB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10.5L10 13.5L15 8.5" stroke="#53BDEB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                          ) : msg.delivered ? (
                            <span title="Delivered" className=""><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom"><path d="M4.5 10.5L7.5 13.5L12.5 8.5" stroke="#A0A0A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10.5L10 13.5L15 8.5" stroke="#A0A0A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                          ) : (
                            <span title="Sent" className=""><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline align-bottom"><path d="M5 9.5L8 12.5L13 7.5" stroke="#6EAF7C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                          )
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }}
      </ListComponent>
    );
  }
  // Fallback for empty message list
  return <div ref={messagesEndRef} />;
});

MessageList.propTypes = {
  messages: PropTypes.array.isRequired,
  clientId: PropTypes.string.isRequired,
  displayName: PropTypes.string,
  clients: PropTypes.array,
  mobile: PropTypes.bool,
  messageAnimations: PropTypes.array,
  handleContextMenu: PropTypes.func.isRequired,
  ListComponent: PropTypes.elementType.isRequired,
  scrollContainerRef: PropTypes.object,
  chatListRef: PropTypes.object,
  messagesEndRef: PropTypes.object,
  isGroupStart: PropTypes.func.isRequired,
  isGroupEnd: PropTypes.func.isRequired,
  selectedTheme: PropTypes.object,
  bubbleColor: PropTypes.string,
  bubbleRadius: PropTypes.number,
  fontFamily: PropTypes.string,
  getAvatar: PropTypes.func.isRequired,
  highlightMentions: PropTypes.func.isRequired,
};

export default MessageList; 