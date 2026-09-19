"use client";

import dynamic from "next/dynamic";

/** Client boundary so three.js never enters the server bundle. */
export const TickerMosaic = dynamic(() => import("./TickerMosaic").then((m) => m.TickerMosaic), { ssr: false });
