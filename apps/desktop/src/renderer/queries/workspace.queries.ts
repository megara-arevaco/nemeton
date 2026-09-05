import { useQuery } from "@tanstack/react-query";

export function useWorkspaceStatusQuery() {
  return useQuery({
    queryKey: ["workspace", "status"],
    queryFn: window.launcher.getWorkspaceStatus,
    enabled: import.meta.env.DEV,
    refetchInterval: import.meta.env.DEV ? 30_000 : false,
    staleTime: 15_000,
  });
}
