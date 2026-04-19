import RequestStatusContent from "@/components/requests/RequestStatusContent";
import { fetchRequestStatus, type RequestWithApi } from "@/lib/requests";

type RequestStatusPageProps = {
  params: Promise<{ requestId: string }>;
};

export default async function RequestStatusPage({ params }: RequestStatusPageProps) {
  const { requestId } = await params;
  let initialRequest: RequestWithApi | null = null;
  let initialError: string | null = null;

  try {
    initialRequest = await fetchRequestStatus(requestId);
  } catch (err) {
    initialError =
      err instanceof Error ? err.message : "Failed to load request";
  }

  return (
    <RequestStatusContent
      initialError={initialError}
      initialRequest={initialRequest}
      requestId={requestId}
    />
  );
}
