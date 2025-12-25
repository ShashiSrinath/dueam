import { Window } from "happy-dom";

const window = new Window();
globalThis.window = window as any;
globalThis.document = window.document as any;
globalThis.navigator = window.navigator as any;
globalThis.Node = window.Node as any;
globalThis.Element = window.Element as any;
globalThis.HTMLElement = window.HTMLElement as any;
globalThis.Event = window.Event as any;
globalThis.CustomEvent = window.CustomEvent as any;
globalThis.MouseEvent = window.MouseEvent as any;
globalThis.getComputedStyle = window.getComputedStyle.bind(window) as any;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as any;
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id as any);

import "@testing-library/jest-dom";
import * as matchers from "@testing-library/jest-dom/matchers";
import { mock, afterEach, expect } from "bun:test";
import { cleanup } from "@testing-library/react";
import React from "react";
import { useEmailStore } from "@/lib/store";

// Extend expect with jest-dom matchers
expect.extend(matchers as any);

// Mock window.matchMedia
const matchMediaMock = mock((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: mock(() => {}), // deprecated
  removeListener: mock(() => {}), // deprecated
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {}),
  dispatchEvent: mock(() => {}),
}));

Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
});

// Global Tauri Mock
export const mockInvoke = mock((..._args: any[]) => Promise.resolve<any>(undefined));
export const mockListen = mock((..._args: any[]) => Promise.resolve<any>(() => {}));

mock.module("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

// Global TanStack Router Mock
export const mockNavigate = mock((..._args: any[]) => {});
mock.module("@tanstack/react-router", () => ({
  useSearch: mock(() => ({})),
  useNavigate: mock(() => mockNavigate),
  useParams: mock(() => ({})),
  createFileRoute: () => (params: any) => ({
    ...params,
    useSearch: mock(() => ({})),
    useNavigate: mock(() => mockNavigate),
    useParams: mock(() => ({})),
    useLoaderData: mock(() => ({})),
  }),
  Link: ({ children, to, params, search, onClick }: any) => {
    return React.createElement("a", { 
      href: to, 
      onClick: (e: any) => {
        e.preventDefault();
        if (onClick) onClick(e);
        mockNavigate({ to, params, search });
      },
      "data-search": JSON.stringify(search) 
    }, children);
  },
  Outlet: () => React.createElement("div", { "data-testid": "outlet" }),
}));

afterEach(() => {
  cleanup();
  useEmailStore.getState().reset();
});