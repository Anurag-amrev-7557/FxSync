# Data Persistence

The FxSync application now supports data persistence across page refreshes using localStorage.

## What's Persisted

- **Chat Messages**: All chat messages and reactions are saved per session
- **Playlist Queue**: The current playlist queue is saved per session
- **Session Data**: Display names and other session-specific data

## How It Works

1. **Automatic Saving**: Data is automatically saved to localStorage whenever:
   - New chat messages are received or sent
   - Reactions are sent
   - Queue is updated
   - Session is joined

2. **Automatic Loading**: When you refresh the page or rejoin a session:
   - Previous chat messages are restored
   - Previous queue is restored
   - Your display name is remembered

3. **Session Isolation**: Each session has its own storage space, so data from different sessions doesn't interfere with each other.

## Storage Management

- **Automatic Cleanup**: The app automatically keeps only the 10 most recent sessions to prevent localStorage from filling up
- **Manual Clear**: You can manually clear saved data for the current session using the "Clear Data" button in the header

## Technical Details

- Data is stored using session-specific keys (e.g., `fxsync_messages_session123`)
- All storage operations include error handling to prevent crashes
- The persistence system is designed to be transparent to the user

## Browser Compatibility

This feature works in all modern browsers that support localStorage. If localStorage is not available, the app will continue to work normally but without persistence.
