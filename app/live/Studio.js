"use client";

import dynamic from "next/dynamic";

// Camera, WebRTC and MediaPipe are browser-only, so the studio never renders on the server.
const LiveStudio = dynamic(() => import("@/components/LiveStudio"), {
  ssr: false,
  loading: () => <div className="h-[100dvh] bg-void" />,
});

export default function Studio(props) {
  return <LiveStudio {...props} />;
}
