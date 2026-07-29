import {
  createContext,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type RouteName = "home" | "game" | "replay";
type RouteMatch = {
  name: RouteName;
  params: {
    gameId?: string;
    stateIndex?: string;
  };
};

type RouterContextValue = RouteMatch & {
  navigate: (path: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);
const NAVIGATION_EVENT = "catanatron:navigate";

function decodeSegment(value: string | undefined) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function matchRoute(pathname: string): RouteMatch {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "games" && segments[1]) {
    if (segments[2] === "states" && segments[3]) {
      return {
        name: "replay",
        params: {
          gameId: decodeSegment(segments[1]),
          stateIndex: decodeSegment(segments[3]),
        },
      };
    }
    return {
      name: "game",
      params: { gameId: decodeSegment(segments[1]) },
    };
  }
  if (segments[0] === "replays" && segments[1]) {
    return {
      name: "replay",
      params: { gameId: decodeSegment(segments[1]) },
    };
  }
  return { name: "home", params: {} };
}

export function AppRouter({
  children,
  initialPath,
}: {
  children: ReactNode;
  initialPath?: string;
}) {
  const [pathname, setPathname] = useState(
    initialPath ?? window.location.pathname,
  );

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    const handleNavigation = (event: Event) => {
      const nextPath = (event as CustomEvent<string>).detail;
      setPathname(nextPath);
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener(NAVIGATION_EVENT, handleNavigation);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
    };
  }, []);

  const navigate = useCallback(
    (path: string, options?: { replace?: boolean }) => {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (options?.replace) {
        window.history.replaceState({}, "", url);
      } else {
        window.history.pushState({}, "", url);
      }
      window.dispatchEvent(
        new CustomEvent<string>(NAVIGATION_EVENT, { detail: url.pathname }),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ ...matchRoute(pathname), navigate }),
    [navigate, pathname],
  );

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

function useRouter() {
  const value = useContext(RouterContext);
  if (!value) throw new Error("Routing hooks must be used inside AppRouter");
  return value;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams() {
  return useRouter().params;
}

export function useRouteMatch() {
  const { name, params } = useRouter();
  return { name, params };
}

export function Link({
  to,
  onClick,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
}) {
  const navigate = useNavigate();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a {...props} href={to} onClick={handleClick}>
      {children}
    </a>
  );
}
