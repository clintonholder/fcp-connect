import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { useProxy } from "@/lib/proxy-context";
import { getUnreadMessageCount } from "@/lib/messages.functions";

/** Unread message count for the signed-in user, or the viewed user under View As. */
export function useUnreadMessageCount(): number {
  const { user } = useAuth();
  const { proxy } = useProxy();
  const viewerId = proxy?.userId ?? user?.id;
  const fetchCount = useServerFn(getUnreadMessageCount);
  const { data } = useQuery({
    queryKey: ["messages-unread", viewerId],
    enabled: !!viewerId,
    queryFn: () => fetchCount({ data: { viewAsUserId: proxy?.userId } }),
  });
  return data?.count ?? 0;
}
