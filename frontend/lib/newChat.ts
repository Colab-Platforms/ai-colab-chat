import type { useRouter } from "next/navigation";

const pendingNewChatContextsKey = "pending_new_chat_context_ids";
const pendingNewChatFolderIdKey = "pending_new_chat_folder_id";

/**
 * Shared by the sidebar's "New Chat" button and the Projects hub's
 * ProjectChatsModal — keeps the localStorage/event contract that
 * NewChatPage/HomeFolderScopeSync depend on in one place.
 */
export function startNewChatInFolder(
  router: ReturnType<typeof useRouter>,
  folderId?: number | null,
  opts?: { isDraftRoute?: boolean },
) {
  const nextFolderId = folderId && folderId > 0 ? folderId : null;

  localStorage.removeItem("selectedAssistantId");
  localStorage.removeItem(pendingNewChatContextsKey);
  localStorage.removeItem(pendingNewChatFolderIdKey);
  if (nextFolderId) {
    localStorage.setItem(pendingNewChatFolderIdKey, String(nextFolderId));
  }
  window.dispatchEvent(new Event("assistant-selected"));

  window.dispatchEvent(
    new CustomEvent("pending-new-chat-folder-updated", {
      detail: { folderId: nextFolderId },
    }),
  );

  // HomeFolderScopeSync (app/(chat)/home/page.tsx) treats the URL's
  // `folderId` param as the source of truth and clears localStorage whenever
  // it's absent — so navigating to a bare "/home" would immediately wipe the
  // value just set above. Carry it through the URL too so the two stay in sync.
  const homeHref = nextFolderId ? `/home?folderId=${nextFolderId}` : "/home";
  if (opts?.isDraftRoute) {
    // Already on the new-chat screen, so no navigation (and thus no
    // HomeFolderScopeSync re-run) will happen. Update the URL in place
    // anyway so it can't go stale and later resync localStorage backwards.
    router.replace(homeHref);
    return;
  }
  router.push(homeHref);
}
