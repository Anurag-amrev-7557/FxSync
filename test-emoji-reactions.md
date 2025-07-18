# Emoji Reaction Test Plan

## Backend Tests

### 1. Socket Event Handlers

- [ ] `emoji_reaction` event adds reaction to message
- [ ] `remove_emoji_reaction` event removes reaction from message
- [ ] `get_message_reactions` event returns reactions for message
- [ ] Reactions are aggregated correctly (count, users)
- [ ] Real-time updates are broadcast to all clients

### 2. Data Storage

- [ ] Reactions are stored per session
- [ ] Reactions are stored per message
- [ ] User tracking works correctly
- [ ] Reaction counts are accurate

## Frontend Tests

### 1. UI Display

- [ ] Emoji reactions appear above message bubbles
- [ ] Reactions show correct emoji and count
- [ ] User's own reactions are highlighted
- [ ] Reactions are positioned correctly (right for own messages, left for others)

### 2. Interaction

- [ ] Clicking emoji reaction adds reaction
- [ ] Clicking own reaction removes it
- [ ] Context menu shows emoji row
- [ ] Emoji row disappears after reaction

### 3. Real-time Updates

- [ ] Reactions update in real-time across all clients
- [ ] New reactions appear immediately
- [ ] Removed reactions disappear immediately
- [ ] Multiple users can react to same message

### 4. Mobile Support

- [ ] Long-press shows context menu
- [ ] Emoji reactions work on mobile
- [ ] Touch interactions work correctly

## Test Steps

1. **Start both servers**

   ```bash
   cd backend && npm start
   cd frontend && npm run dev
   ```

2. **Open multiple browser tabs/windows**
   - Join same session with different display names
   - Verify all clients can see each other

3. **Test emoji reactions**
   - Right-click (desktop) or long-press (mobile) on a message
   - Select emoji from context menu
   - Verify reaction appears above message
   - Verify reaction appears for all clients in real-time

4. **Test reaction interactions**
   - Click on existing reaction to add your own
   - Click on your own reaction to remove it
   - Verify counts update correctly
   - Verify real-time updates work

5. **Test multiple reactions**
   - Add different emojis to same message
   - Verify all reactions display correctly
   - Verify counts are accurate

6. **Test edge cases**
   - Remove all reactions from a message
   - Add reactions to deleted messages
   - Test with many reactions on one message

## Expected Behavior

- ✅ Emoji reactions appear above message bubbles
- ✅ Reactions show emoji and count
- ✅ User's reactions are highlighted
- ✅ Clicking reactions adds/removes them
- ✅ Real-time updates work across all clients
- ✅ Mobile support works correctly
- ✅ Context menu integration works
- ✅ Animations are smooth
- ✅ Error handling works correctly
