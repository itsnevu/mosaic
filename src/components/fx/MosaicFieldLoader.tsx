"use client";

import dynamic from "next/dynamic";

/** Client boundary so three.js never enters the server bundle. */
export const MosaicField = dynamic(() => import("./MosaicField").then((m) => m.MosaicField), { ssr: false });
