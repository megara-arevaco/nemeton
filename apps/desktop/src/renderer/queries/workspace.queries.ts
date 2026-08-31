import { useQuery } from "@tanstack/react-query";

export function useWorkspaceStatusQuery() {
  return useQuery({
    queryKey: ["workspace", "status"],
    queryFn: window.launcher.getWorkspaceStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
