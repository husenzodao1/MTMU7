/**
 * Marks a conversation's place in the history as opened from the list, so
 * going back from it is going back to the list (history.back), not a new
 * visit to the list on top of it — the thread's back arrow
 * (messages-frame.tsx) and Android's back button (native-app.tsx) alike.
 * Apart from both so the app's frame does not load the messenger to read it.
 */
export const FROM_LIST = "mtmu7FromList";
