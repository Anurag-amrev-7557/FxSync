# Emoji Reactions Persistence Test Guide

## Test Steps

### 1. Start the Application
- Backend should be running on port 4000
- Frontend should be running on port 5173 or 5174
- Open the application in your browser

### 2. Create/Join a Session
- Create a new session or join an existing one
- Make sure you can see the chat interface

### 3. Add Emoji Reactions
- Send a few chat messages
- Long-press or right-click on a message to show the emoji row
- Click on different emojis to add reactions
- Verify reactions appear below the messages with counts

### 4. Test Persistence
- **Before refresh**: Note which messages have reactions and what the counts are
- **Refresh the page** (F5 or Cmd+R)
- **After refresh**: Verify that:
  - All reactions are still visible
  - Reaction counts are correct
  - Your own reactions are highlighted
  - Other users' reactions are also preserved

### 5. Test Adding/Removing After Refresh
- Add new reactions to messages after the refresh
- Remove some existing reactions
- Refresh the page again
- Verify that the new state persists

### 6. Test Multiple Users
- Open the app in multiple browser tabs/windows
- Join the same session with different display names
- Add reactions from different "users"
- Refresh all tabs
- Verify that all reactions from all users persist

## Expected Behavior

### ✅ What Should Work
- Reactions persist across page refreshes
- Reaction counts are accurate
- Your reactions are highlighted differently
- Multiple users' reactions are preserved
- Adding/removing reactions works after refresh
- Session isolation (reactions from different sessions don't interfere)

### ❌ What Won't Work
- Reactions are lost if the server restarts (backend is in-memory only)
- Reactions don't sync across different devices/browsers
- Reactions don't persist if localStorage is disabled

## Debugging

### Check localStorage
Open browser dev tools and check:
```javascript
// Check if reactions are saved
localStorage.getItem('fxsync_reactions_yourSessionId')

// Check all fxsync keys
Object.keys(localStorage).filter(key => key.startsWith('fxsync_'))
```

### Check Console
Look for any errors in the browser console related to:
- `saveReactions` function
- `loadReactions` function
- Socket connection issues

## Troubleshooting

### Reactions Not Persisting
1. Check if localStorage is enabled in your browser
2. Check browser console for errors
3. Verify sessionId is being passed correctly
4. Check if the persistence functions are being called

### Reactions Not Loading
1. Check if the `loadReactions` function is called on mount
2. Verify the sessionId matches between save and load
3. Check if the data format is correct

### Performance Issues
1. Check if reactions are being saved too frequently
2. Verify the Map to Object conversion is working correctly
3. Check if there are memory leaks from the useEffect dependencies

## Success Criteria

The test is successful if:
- ✅ Reactions survive page refresh
- ✅ Multiple users' reactions are preserved
- ✅ Adding/removing reactions works after refresh
- ✅ No console errors
- ✅ Performance is smooth
- ✅ Session isolation works correctly

If all criteria are met, the emoji reactions persistence feature is working correctly! 